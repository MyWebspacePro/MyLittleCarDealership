import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import {
  DOCS_DIR,
  LEADS_DOCS_DIR,
  LEADS_PHOTOS_DIR,
  PHOTOS_DIR,
  UploadError,
  isSafeFilename,
  mimeForFilename,
  saveGeneratedFile,
  saveUpload,
  sanitizeOriginalName,
  MAX_FILE_BYTES,
} from "../lib/uploads.js";

const LEAD_STATUSES = ["NEU", "GEPRUEFT", "UEBERNOMMEN", "VERWORFEN"] as const;
const LEAD_FILE_KINDS = ["FOTO", "FAHRZEUGAUSWEIS", "SONSTIGES"] as const;
const PURCHASE_CHANNELS = ["WEBFORM", "WHATSAPP", "EMAIL", "TELEFON", "PERSOENLICH", "AUTOSCOUT24", "SONSTIGE"] as const;

const idParams = z.object({ id: z.string().min(1) });
const nullableText = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.string().max(8000).nullable().optional(),
);
const nullableInt = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.coerce.number().int().min(0).nullable().optional(),
);
const nullablePrice = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.coerce.number().min(0).nullable().optional(),
);

const leadCreateSchema = z.object({
  channel: z.enum(PURCHASE_CHANNELS).default("WEBFORM"),
  sellerName: nullableText,
  sellerPhone: nullableText,
  sellerEmail: nullableText,
  make: nullableText,
  model: nullableText,
  variant: nullableText,
  mileageKm: nullableInt,
  year: nullableInt,
  askingPrice: nullablePrice,
  message: nullableText,
  assignedToId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
});

const leadUpdateSchema = leadCreateSchema.partial().extend({
  status: z.enum(LEAD_STATUSES).optional(),
});

const contactInputSchema = z.object({
  type: z.enum(["PRIVAT", "FIRMA"]).default("PRIVAT"),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  companyName: z.string().max(160).optional(),
  phone: z.string().max(60).optional(),
  mobile: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  street: z.string().max(160).optional(),
  zip: z.string().max(16).optional(),
  city: z.string().max(80).optional(),
});

const convertSchema = z.object({
  contactId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  contact: contactInputSchema.optional(),
  vehicle: z.object({
    make: z.string().min(1, "Marke fehlt").max(80),
    model: z.string().min(1, "Modell fehlt").max(80),
    variant: z.string().max(120).optional(),
    chassisNumber: z.string().max(40).optional(),
    firstRegistration: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.date().nullable().optional()),
    mileageKm: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().int().min(0).nullable().optional()),
    targetSalePrice: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().min(0).nullable().optional()),
  }),
});

function serializeLead<T extends { files?: { kind: string }[]; vehicle?: unknown; assignedTo?: { name: string } | null; sellerName: string | null }>(l: T) {
  return {
    ...l,
    photoCount: (l.files ?? []).filter((f) => f.kind === "FOTO").length,
    documentCount: (l.files ?? []).filter((f) => f.kind !== "FOTO").length,
  };
}

export async function leadRoutes(app: FastifyInstance): Promise<void> {
  app.get("/leads", { preHandler: authGuard }, async (req) => {
    const { status } = z.object({ status: z.enum(LEAD_STATUSES).optional() }).parse(req.query);
    const leads = await prisma.purchaseLead.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        files: { select: { kind: true } },
        vehicle: { select: { id: true, make: true, model: true, status: true } },
        assignedTo: { select: { name: true } },
      },
    });
    return leads.map(serializeLead);
  });

  app.get("/leads/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const lead = await prisma.purchaseLead.findUnique({
      where: { id },
      include: {
        files: { orderBy: { createdAt: "asc" } },
        vehicle: { select: { id: true, make: true, model: true, status: true } },
        assignedTo: { select: { name: true } },
      },
    });
    if (!lead) return reply.code(404).send({ error: "Anfrage nicht gefunden" });
    return serializeLead(lead);
  });

  app.post("/leads", { preHandler: authGuard }, async (req, reply) => {
    const body = leadCreateSchema.parse(req.body);
    if (body.assignedToId && !(await prisma.user.findUnique({ where: { id: body.assignedToId } }))) {
      return reply.code(400).send({ error: "Zuständige Person nicht gefunden" });
    }
    const lead = await prisma.purchaseLead.create({
      data: {
        channel: body.channel,
        sellerName: body.sellerName ?? null,
        sellerPhone: body.sellerPhone ?? null,
        sellerEmail: body.sellerEmail ?? null,
        make: body.make ?? null,
        model: body.model ?? null,
        variant: body.variant ?? null,
        mileageKm: body.mileageKm ?? null,
        year: body.year ?? null,
        askingPrice: body.askingPrice ?? null,
        message: body.message ?? null,
        assignedToId: body.assignedToId ?? null,
      },
    });
    await audit(req.user!.id, "CREATE", "PurchaseLead", lead.id, { channel: lead.channel });
    return reply.code(201).send(lead);
  });

  app.put("/leads/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = leadUpdateSchema.parse(req.body);
    const existing = await prisma.purchaseLead.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Anfrage nicht gefunden" });
    if (existing.status === "UEBERNOMMEN" && body.status && body.status !== "UEBERNOMMEN") {
      return reply.code(400).send({ error: "Übernommene Anfragen können nicht zurückgesetzt werden" });
    }
    const data: Record<string, unknown> = {};
    for (const f of ["sellerName", "sellerPhone", "sellerEmail", "make", "model", "variant", "message"] as const) {
      if (body[f] !== undefined) data[f] = body[f] ?? null;
    }
    if (body.mileageKm !== undefined) data.mileageKm = body.mileageKm ?? null;
    if (body.year !== undefined) data.year = body.year ?? null;
    if (body.askingPrice !== undefined) data.askingPrice = body.askingPrice ?? null;
    if (body.channel !== undefined) data.channel = body.channel;
    if (body.status !== undefined) data.status = body.status;
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId ?? null;

    const lead = await prisma.purchaseLead.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "PurchaseLead", id, { fields: Object.keys(data) });
    return lead;
  });

  app.delete("/leads/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const lead = await prisma.purchaseLead.findUnique({ where: { id } });
    if (!lead) return reply.code(404).send({ error: "Anfrage nicht gefunden" });
    if (lead.status === "UEBERNOMMEN") {
      return reply.code(400).send({ error: "Übernommene Anfragen gehören zu einem Fahrzeug und können nicht gelöscht werden" });
    }
    await prisma.purchaseLead.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "PurchaseLead", id);
    return { ok: true };
  });

  // ── Dateien: Fotos (öffentlich) und Belege (privat) ──────────────────────

  app.post("/leads/:id/files", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const lead = await prisma.purchaseLead.findUnique({ where: { id }, select: { id: true } });
    if (!lead) return reply.code(404).send({ error: "Anfrage nicht gefunden" });
    let kind: string = "FOTO";
    let filePart: import("@fastify/multipart").MultipartFile | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file") filePart = part;
      else if (part.fieldname === "kind") kind = String(part.value);
    }
    if (!filePart) return reply.code(400).send({ error: "Keine Datei erhalten" });
    const parsedKind = z.enum(LEAD_FILE_KINDS).safeParse(kind);
    const fileKind = parsedKind.success ? parsedKind.data : "FOTO";
    const buffer = await filePart.toBuffer();
    let filename: string;
    try {
      filename = await saveUpload(fileKind === "FOTO" ? LEADS_PHOTOS_DIR : LEADS_DOCS_DIR, buffer, filePart.mimetype);
    } catch (err) {
      if (err instanceof UploadError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    const file = await prisma.leadFile.create({
      data: { leadId: id, kind: fileKind, filename, originalName: sanitizeOriginalName(filePart.filename) },
    });
    await audit(req.user!.id, "UPLOAD", "LeadFile", file.id, { leadId: id, kind: fileKind });
    return reply.code(201).send(file);
  });

  app.delete("/leads/:id/files/:fileId", { preHandler: authGuard }, async (req, reply) => {
    const { id, fileId } = z.object({ id: z.string().min(1), fileId: z.string().min(1) }).parse(req.params);
    const { unlink } = await import("node:fs/promises");
    const file = await prisma.leadFile.findFirst({ where: { id: fileId, leadId: id } });
    if (!file) return reply.code(404).send({ error: "Datei nicht gefunden" });
    await prisma.leadFile.delete({ where: { id: file.id } });
    await unlink(path.join(file.kind === "FOTO" ? LEADS_PHOTOS_DIR : LEADS_DOCS_DIR, file.filename)).catch(() => undefined);
    await audit(req.user!.id, "DELETE", "LeadFile", file.id, { leadId: id });
    return { ok: true };
  });

  app.get("/leads/:id/files/:fileId", { preHandler: authGuard }, async (req, reply) => {
    const { id, fileId } = z.object({ id: z.string().min(1), fileId: z.string().min(1) }).parse(req.params);
    const file = await prisma.leadFile.findFirst({ where: { id: fileId, leadId: id } });
    if (!file) return reply.code(404).send({ error: "Datei nicht gefunden" });
    const { createReadStream } = await import("node:fs");
    const full = path.join(file.kind === "FOTO" ? LEADS_PHOTOS_DIR : LEADS_DOCS_DIR, file.filename);
    if (!isSafeFilename(file.filename) || !(await import("node:fs/promises")).stat(full).then((s) => s.isFile()).catch(() => false)) {
      return reply.code(404).send({ error: "Datei nicht gefunden" });
    }
    reply.header("Content-Type", mimeForFilename(file.filename) ?? "application/octet-stream");
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName ?? file.filename)}`,
    );
    return reply.send(createReadStream(full));
  });

  // ── Übernehmen: Lead wird zu Fahrzeug + Ankaufsvorgang ───────────────────

  app.post("/leads/:id/convert", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const lead = await prisma.purchaseLead.findUnique({ where: { id }, include: { files: true } });
    if (!lead) return reply.code(404).send({ error: "Anfrage nicht gefunden" });
    if (lead.status === "UEBERNOMMEN") {
      return reply.code(409).send({ error: "Diese Anfrage wurde bereits übernommen" });
    }
    const body = convertSchema.parse(req.body);

    // Kontakt: bestehender verknüpft, neuer angelegt oder keiner.
    let contactId: string | null = body.contactId ?? null;
    if (!contactId && body.contact) {
      const c = body.contact;
      const contact = await prisma.contact.create({
        data: {
          type: c.type,
          firstName: c.firstName?.trim() || null,
          lastName: c.lastName?.trim() || null,
          companyName: c.companyName?.trim() || null,
          phone: c.phone?.trim() || null,
          mobile: c.mobile?.trim() || lead.sellerPhone,
          email: c.email?.trim() || lead.sellerEmail,
          street: c.street?.trim() || null,
          zip: c.zip?.trim() || null,
          city: c.city?.trim() || null,
        },
      });
      contactId = contact.id;
    } else if (contactId) {
      const contact = await prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) return reply.code(400).send({ error: "Verkäufer-Kontakt nicht gefunden" });
    }

    if (body.vehicle.chassisNumber) {
      const clash = await prisma.vehicle.findUnique({ where: { chassisNumber: body.vehicle.chassisNumber } });
      if (clash) return reply.code(409).send({ error: "Stammnummer ist bereits erfasst" });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        status: "ANGEFRAGT",
        make: body.vehicle.make.trim(),
        model: body.vehicle.model.trim(),
        variant: body.vehicle.variant?.trim() || lead.variant,
        chassisNumber: body.vehicle.chassisNumber?.trim() || null,
        firstRegistration: body.vehicle.firstRegistration ?? (lead.year ? new Date(lead.year, 0, 1) : null),
        mileageKm: body.vehicle.mileageKm ?? lead.mileageKm,
        targetSalePrice: body.vehicle.targetSalePrice ?? null,
        // Erstkontakt-Notiz als Grundlage für Exposé & Kalkulation.
        description: lead.message ?? null,
      },
    });

    const notesParts: string[] = [];
    if (lead.askingPrice != null) notesParts.push(`Preisvorstellung des Verkäufers: ${lead.askingPrice} CHF`);
    if (lead.message) notesParts.push(lead.message);
    const deal = await prisma.purchaseDeal.create({
      data: {
        vehicleId: vehicle.id,
        sellerId: contactId,
        channel: lead.channel,
        notes: notesParts.join("\n\n") || null,
      },
    });

    // Dateien mitnehmen: Fotos werden Fahrzeugfotos, Belege Fahrzeug-Dokumente.
    for (const file of lead.files) {
      const sourceDir = file.kind === "FOTO" ? LEADS_PHOTOS_DIR : LEADS_DOCS_DIR;
      const buffer = await readFile(path.join(sourceDir, file.filename)).catch(() => null);
      if (!buffer) continue;
      const ext = path.extname(file.filename);
      if (file.kind === "FOTO") {
        const filename = await saveGeneratedFile(PHOTOS_DIR, buffer, ext);
        const max = await prisma.vehiclePhoto.aggregate({ where: { vehicleId: vehicle.id }, _max: { sortOrder: true } });
        await prisma.vehiclePhoto.create({
          data: {
            vehicleId: vehicle.id,
            filename,
            originalName: file.originalName,
            sortOrder: (max._max.sortOrder ?? -1) + 1,
          },
        });
      } else {
        const filename = await saveGeneratedFile(DOCS_DIR, buffer, ext);
        await prisma.vehicleDocument.create({
          data: {
            vehicleId: vehicle.id,
            kind: file.kind === "FAHRZEUGAUSWEIS" ? "FAHRZEUGAUSWEIS" : "SONSTIGES",
            filename,
            originalName: file.originalName,
          },
        });
      }
    }

    await prisma.purchaseLead.update({
      where: { id },
      data: { status: "UEBERNOMMEN", vehicleId: vehicle.id },
    });
    // CRM-Historie: der Lead (Erstkontakt) erscheint in der Kunden-Timeline.
    if (contactId) {
      await prisma.communicationLog.create({
        data: {
          contactId,
          vehicleId: vehicle.id,
          channel: lead.channel,
          direction: "EINGANG",
          subject: `Ankaufsanfrage (${lead.channel})`,
          body: lead.message,
          source: lead.channel === "WEBFORM" ? "WEBFORM" : "MANUAL",
          createdById: req.user!.id,
        },
      });
    }
    await audit(req.user!.id, "CONVERT", "PurchaseLead", id, { vehicleId: vehicle.id, dealId: deal.id });
    return reply.code(201).send({ vehicleId: vehicle.id, dealId: deal.id });
  });
}
