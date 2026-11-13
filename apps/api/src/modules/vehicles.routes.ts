import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";
import {
  DOCS_DIR,
  MAX_FILE_BYTES,
  PHOTOS_DIR,
  UploadError,
  isSafeFilename,
  mimeForFilename,
  sanitizeOriginalName,
  saveUpload,
} from "../lib/uploads.js";
import { contactDisplayName } from "./contacts.routes.js";

const VEHICLE_STATUSES = [
  "ANGEFRAGT",
  "KALKULATION",
  "ANGEBOT",
  "GEKAUFT",
  "AUFBEREITUNG",
  "VERKAUF",
  "VERKAUFT",
  "ABGESCHLOSSEN",
  "ABGELEHNT",
] as const;
const DOCUMENT_KINDS = ["FAHRZEUGAUSWEIS", "SERVICEHEFT", "BERICHT", "SONSTIGES"] as const;

const idParams = z.object({ id: z.string().min(1) });

// Leere Formularfelder konsequent zu null machen (nicht 0 / Invalid Date).
const nullableInt = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.coerce.number().int().min(0).nullable().optional(),
);
const nullablePrice = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.coerce.number().min(0).nullable().optional(),
);
const nullableDate = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.coerce.date().nullable().optional(),
);
const nullableText = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.string().max(8000).nullable().optional(),
);

const vehicleFieldsSchema = {
  variant: nullableText,
  chassisNumber: nullableText,
  firstRegistration: nullableDate,
  mileageKm: nullableInt,
  fuel: nullableText,
  transmission: nullableText,
  color: nullableText,
  plates: nullableText,
  mfkUntil: nullableDate,
  hasServiceBook: z.coerce.boolean().optional(),
  targetSalePrice: nullablePrice,
  description: nullableText,
  as24Url: z.preprocess(
    (v) => (v === "" || v === null ? null : v),
    z.string().url("Ungültige URL").nullable().optional(),
  ),
};

const vehicleCreateSchema = z.object({
  make: z.string().min(1, "Marke fehlt").max(80),
  model: z.string().min(1, "Modell fehlt").max(80),
  status: z.enum(VEHICLE_STATUSES).optional(),
  ...vehicleFieldsSchema,
});

const vehicleUpdateSchema = z.object({
  make: z.string().min(1).max(80).optional(),
  model: z.string().min(1).max(80).optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  ...vehicleFieldsSchema,
});

const vehicleListInclude = {
  photos: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  purchase: {
    select: {
      id: true,
      status: true,
      channel: true,
      purchasePrice: true,
      recommendedPrice: true,
      estimatedSalePrice: true,
      paymentMethod: true,
      seller: { select: { type: true, firstName: true, lastName: true, companyName: true } },
    },
  },
  sale: {
    select: {
      id: true,
      status: true,
      salePrice: true,
      paymentMethod: true,
      buyer: { select: { type: true, firstName: true, lastName: true, companyName: true } },
    },
  },
} satisfies Prisma.VehicleInclude;

type VehicleListRow = Prisma.VehicleGetPayload<{ include: typeof vehicleListInclude }>;

const vehicleDetailInclude = {
  photos: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  documents: { orderBy: { createdAt: "desc" as const } },
  purchase: {
    include: {
      valuationItems: { orderBy: { id: "asc" as const } },
      seller: { select: { type: true, firstName: true, lastName: true, companyName: true } },
    },
  },
  sale: {
    include: {
      buyer: { select: { type: true, firstName: true, lastName: true, companyName: true } },
    },
  },
  workOrders: { orderBy: { createdAt: "desc" as const } },
  inquiries: { orderBy: { createdAt: "desc" as const } },
  appointments: { orderBy: { startsAt: "desc" as const } },
} satisfies Prisma.VehicleInclude;

type VehicleDetailRow = Prisma.VehicleGetPayload<{ include: typeof vehicleDetailInclude }>;

function daysInStatus(statusChangedAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - statusChangedAt.getTime()) / 86_400_000));
}

const n = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : Number(v));

function serializeVehicleList(v: VehicleListRow) {
  return {
    id: v.id,
    status: v.status,
    statusChangedAt: v.statusChangedAt,
    daysInStatus: daysInStatus(v.statusChangedAt),
    make: v.make,
    model: v.model,
    variant: v.variant,
    chassisNumber: v.chassisNumber,
    firstRegistration: v.firstRegistration,
    mileageKm: v.mileageKm,
    fuel: v.fuel,
    transmission: v.transmission,
    color: v.color,
    plates: v.plates,
    mfkUntil: v.mfkUntil,
    hasServiceBook: v.hasServiceBook,
    targetSalePrice: n(v.targetSalePrice),
    as24Url: v.as24Url,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    coverPhoto: v.photos[0]?.filename ?? null,
    photosCount: v.photos.length,
    purchase: v.purchase
      ? {
          id: v.purchase.id,
          status: v.purchase.status,
          channel: v.purchase.channel,
          purchasePrice: n(v.purchase.purchasePrice),
          recommendedPrice: n(v.purchase.recommendedPrice),
          estimatedSalePrice: n(v.purchase.estimatedSalePrice),
          paymentMethod: v.purchase.paymentMethod,
          sellerName: v.purchase.seller ? contactDisplayName(v.purchase.seller) : null,
        }
      : null,
    sale: v.sale
      ? {
          id: v.sale.id,
          status: v.sale.status,
          salePrice: n(v.sale.salePrice),
          paymentMethod: v.sale.paymentMethod,
          buyerName: v.sale.buyer ? contactDisplayName(v.sale.buyer) : null,
        }
      : null,
  };
}

function serializeVehicleDetail(v: VehicleDetailRow) {
  const base = serializeVehicleList(v) as Record<string, unknown>;
  const p = v.purchase;
  const s = v.sale;
  return {
    ...base,
    description: v.description,
    photos: v.photos,
    documents: v.documents,
    purchase: p
      ? {
          id: p.id,
          vehicleId: p.vehicleId,
          sellerId: p.sellerId,
          sellerName: p.seller ? contactDisplayName(p.seller) : null,
          status: p.status,
          channel: p.channel,
          paymentMethod: p.paymentMethod,
          purchasePrice: n(p.purchasePrice),
          recommendedPrice: n(p.recommendedPrice),
          targetProfit: n(p.targetProfit),
          estimatedSalePrice: n(p.estimatedSalePrice),
          paymentDueDate: p.paymentDueDate,
          purchasedAt: p.purchasedAt,
          notes: p.notes,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          costsTotal: p.valuationItems.reduce((sum, item) => sum + Number(item.amount), 0),
          valuationItems: p.valuationItems.map((item) => ({
            id: item.id,
            kind: item.kind,
            description: item.description,
            amount: Number(item.amount),
          })),
        }
      : null,
    sale: s
      ? {
          id: s.id,
          vehicleId: s.vehicleId,
          buyerId: s.buyerId,
          buyerName: s.buyer ? contactDisplayName(s.buyer) : null,
          status: s.status,
          salePrice: n(s.salePrice),
          paymentMethod: s.paymentMethod,
          leasingPartner: s.leasingPartner,
          soldAt: s.soldAt,
          notes: s.notes,
        }
      : null,
    workOrders: v.workOrders.map((w) => ({
      id: w.id,
      vehicleId: w.vehicleId,
      type: w.type,
      providerType: w.providerType,
      providerName: w.providerName,
      description: w.description,
      status: w.status,
      costEstimate: n(w.costEstimate),
      costActual: n(w.costActual),
      plannedFor: w.plannedFor,
      completedAt: w.completedAt,
      notes: w.notes,
      createdAt: w.createdAt,
    })),
    inquiries: v.inquiries.map((i) => ({
      id: i.id,
      vehicleId: i.vehicleId,
      contactId: i.contactId,
      channel: i.channel,
      subject: i.subject,
      summary: i.summary,
      nextFollowUpAt: i.nextFollowUpAt,
      resolvedAt: i.resolvedAt,
      createdAt: i.createdAt,
    })),
    appointments: v.appointments.map((a) => ({
      id: a.id,
      vehicleId: a.vehicleId,
      contactId: a.contactId,
      type: a.type,
      title: a.title,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      notes: a.notes,
    })),
  };
}

async function fileExists(full: string): Promise<boolean> {
  try {
    return (await stat(full)).isFile();
  } catch {
    return false;
  }
}

export async function vehicleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/vehicles", { preHandler: authGuard }, async (req) => {
    const { q, status } = z
      .object({ q: z.string().max(120).optional(), status: z.enum(VEHICLE_STATUSES).optional() })
      .parse(req.query);

    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { make: { contains: q, mode: "insensitive" as const } },
              { model: { contains: q, mode: "insensitive" as const } },
              { variant: { contains: q, mode: "insensitive" as const } },
              { chassisNumber: { contains: q, mode: "insensitive" as const } },
              { plates: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const vehicles = await prisma.vehicle.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: vehicleListInclude,
    });
    return vehicles.map(serializeVehicleList);
  });

  app.get("/vehicles/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, include: vehicleDetailInclude });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    return serializeVehicleDetail(vehicle);
  });

  app.post("/vehicles", { preHandler: authGuard }, async (req, reply) => {
    const body = vehicleCreateSchema.parse(req.body);
    if (body.chassisNumber) {
      const clash = await prisma.vehicle.findUnique({ where: { chassisNumber: body.chassisNumber } });
      if (clash) return reply.code(409).send({ error: "Stammnummer ist bereits erfasst" });
    }
    const vehicle = await prisma.vehicle.create({
      data: {
        make: body.make.trim(),
        model: body.model.trim(),
        ...(body.status ? { status: body.status } : {}),
        variant: body.variant ?? null,
        chassisNumber: body.chassisNumber ?? null,
        firstRegistration: body.firstRegistration ?? null,
        mileageKm: body.mileageKm ?? null,
        fuel: body.fuel ?? null,
        transmission: body.transmission ?? null,
        color: body.color ?? null,
        plates: body.plates ?? null,
        mfkUntil: body.mfkUntil ?? null,
        hasServiceBook: body.hasServiceBook ?? false,
        targetSalePrice: body.targetSalePrice ?? null,
        description: body.description ?? null,
        as24Url: body.as24Url ?? null,
      },
    });
    await audit(req.user!.id, "CREATE", "Vehicle", vehicle.id, { title: `${vehicle.make} ${vehicle.model}` });
    return reply.code(201).send(vehicle);
  });

  app.put("/vehicles/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = vehicleUpdateSchema.parse(req.body);
    const existing = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    if (body.chassisNumber) {
      const clash = await prisma.vehicle.findUnique({ where: { chassisNumber: body.chassisNumber } });
      if (clash && clash.id !== id) return reply.code(409).send({ error: "Stammnummer ist bereits erfasst" });
    }

    const data: Record<string, unknown> = {};
    if (body.make !== undefined) data.make = body.make.trim();
    if (body.model !== undefined) data.model = body.model.trim();
    for (const f of ["variant", "chassisNumber", "fuel", "transmission", "color", "plates", "description", "as24Url"] as const) {
      if (body[f] !== undefined) data[f] = body[f] ?? null;
    }
    for (const f of ["firstRegistration", "mfkUntil"] as const) {
      if (body[f] !== undefined) data[f] = body[f] ?? null;
    }
    if (body.mileageKm !== undefined) data.mileageKm = body.mileageKm ?? null;
    if (body.targetSalePrice !== undefined) data.targetSalePrice = body.targetSalePrice ?? null;
    if (body.hasServiceBook !== undefined) data.hasServiceBook = body.hasServiceBook;
    // Status hier NICHT setzen: er laeuft ausschliesslich ueber /status,
    // damit statusChangedAt (Standtage) sauber mitgefuehrt wird.
    if (body.status !== undefined) {
      return reply.code(400).send({ error: "Status bitte über den Status-Wechsel ändern" });
    }

    const vehicle = await prisma.vehicle.update({ where: { id }, data, include: vehicleDetailInclude });
    await audit(req.user!.id, "UPDATE", "Vehicle", id, { fields: Object.keys(data) });
    return serializeVehicleDetail(vehicle);
  });

  // Statuswechsel der Pipeline (alle Rollen: Alltagsarbeit). statusChangedAt
  // wird neu gesetzt -> Standtage laufen pro Status.
  app.patch("/vehicles/:id/status", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { status } = z.object({ status: z.enum(VEHICLE_STATUSES) }).parse(req.body);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const updated = await prisma.vehicle.update({
      where: { id },
      data: { status, statusChangedAt: new Date() },
    });
    await audit(req.user!.id, "STATUS", "Vehicle", id, { from: vehicle.status, to: status });
    return { id: updated.id, status: updated.status, statusChangedAt: updated.statusChangedAt, daysInStatus: 0 };
  });

  app.delete("/vehicles/:id", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true, make: true, model: true } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    await prisma.vehicle.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "Vehicle", id, { title: `${vehicle.make} ${vehicle.model}` });
    return { ok: true };
  });

  // ── Fotos ────────────────────────────────────────────────────────────────

  app.post("/vehicles/:id/photos", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const file = await req.file({ limits: { fileSize: MAX_FILE_BYTES } });
    if (!file) return reply.code(400).send({ error: "Keine Bilddatei erhalten" });
    const buffer = await file.toBuffer();
    let filename: string;
    try {
      filename = await saveUpload(PHOTOS_DIR, buffer, file.mimetype);
    } catch (err) {
      if (err instanceof UploadError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    const max = await prisma.vehiclePhoto.aggregate({ where: { vehicleId: id }, _max: { sortOrder: true } });
    const photo = await prisma.vehiclePhoto.create({
      data: {
        vehicleId: id,
        filename,
        originalName: sanitizeOriginalName(file.filename),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await audit(req.user!.id, "UPLOAD", "VehiclePhoto", photo.id, { vehicleId: id });
    return reply.code(201).send(photo);
  });

  app.put("/vehicles/:id/photos/order", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.$transaction(
      ids.map((photoId, index) =>
        prisma.vehiclePhoto.updateMany({ where: { id: photoId, vehicleId: id }, data: { sortOrder: index } }),
      ),
    );
    await audit(req.user!.id, "REORDER", "VehiclePhoto", id);
    return { ok: true };
  });

  app.delete("/vehicles/:id/photos/:photoId", { preHandler: authGuard }, async (req, reply) => {
    const { id, photoId } = z.object({ id: z.string().min(1), photoId: z.string().min(1) }).parse(req.params);
    const photo = await prisma.vehiclePhoto.findFirst({ where: { id: photoId, vehicleId: id } });
    if (!photo) return reply.code(404).send({ error: "Foto nicht gefunden" });
    await prisma.vehiclePhoto.delete({ where: { id: photo.id } });
    await unlink(path.join(PHOTOS_DIR, photo.filename)).catch(() => undefined);
    await audit(req.user!.id, "DELETE", "VehiclePhoto", photo.id, { vehicleId: id });
    return { ok: true };
  });

  // ── Verwaltungs-Dokumente (privat, nur über authentifizierte Route) ─────

  app.post("/vehicles/:id/documents", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });

    let kind: string = "SONSTIGES";
    let filePart: import("@fastify/multipart").MultipartFile | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file") {
        filePart = part;
      } else if (part.fieldname === "kind") {
        kind = String(part.value);
      }
    }
    if (!filePart) return reply.code(400).send({ error: "Keine Datei erhalten" });
    const parsedKind = z.enum(DOCUMENT_KINDS).safeParse(kind);
    const buffer = await filePart.toBuffer();
    let filename: string;
    try {
      filename = await saveUpload(DOCS_DIR, buffer, filePart.mimetype);
    } catch (err) {
      if (err instanceof UploadError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    const doc = await prisma.vehicleDocument.create({
      data: {
        vehicleId: id,
        kind: parsedKind.success ? parsedKind.data : "SONSTIGES",
        filename,
        originalName: sanitizeOriginalName(filePart.filename),
      },
    });
    await audit(req.user!.id, "UPLOAD", "VehicleDocument", doc.id, { vehicleId: id, kind: doc.kind });
    return reply.code(201).send(doc);
  });

  app.get("/vehicles/:id/documents/:docId", { preHandler: authGuard }, async (req, reply) => {
    const { id, docId } = z.object({ id: z.string().min(1), docId: z.string().min(1) }).parse(req.params);
    const doc = await prisma.vehicleDocument.findFirst({ where: { id: docId, vehicleId: id } });
    if (!doc) return reply.code(404).send({ error: "Dokument nicht gefunden" });
    const full = path.join(DOCS_DIR, doc.filename);
    if (!isSafeFilename(doc.filename) || !(await fileExists(full))) {
      return reply.code(404).send({ error: "Datei nicht gefunden" });
    }
    reply.header("Content-Type", mimeForFilename(doc.filename) ?? "application/octet-stream");
    const name = doc.originalName ?? doc.filename;
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
    return reply.send(createReadStream(full));
  });

  app.delete("/vehicles/:id/documents/:docId", { preHandler: authGuard }, async (req, reply) => {
    const { id, docId } = z.object({ id: z.string().min(1), docId: z.string().min(1) }).parse(req.params);
    const doc = await prisma.vehicleDocument.findFirst({ where: { id: docId, vehicleId: id } });
    if (!doc) return reply.code(404).send({ error: "Dokument nicht gefunden" });
    await prisma.vehicleDocument.delete({ where: { id: doc.id } });
    await unlink(path.join(DOCS_DIR, doc.filename)).catch(() => undefined);
    await audit(req.user!.id, "DELETE", "VehicleDocument", doc.id, { vehicleId: id });
    return { ok: true };
  });
}
