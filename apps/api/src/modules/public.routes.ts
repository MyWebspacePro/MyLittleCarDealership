import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { sendMail } from "../lib/mailer.js";
import { LEADS_DOCS_DIR, LEADS_PHOTOS_DIR, saveUpload, UploadError } from "../lib/uploads.js";

// Öffentliche Seite (Phase F): Fahrzeugbörse (Verkaufsfahrzeuge ohne
// Business-Daten) und das Ankaufsformular (Erstkontakt → PurchaseLead).
// Bewusst ohne authGuard; Missbrauchsschutz über Honeypot-Feld und
// einfaches IP-Rate-Limit (in-memory, genügt für einen kleinen Betrieb).

const LEAD_RATE_LIMIT = 5; // Anfragen pro IP und Stunde
const rateWindow = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const stamps = (rateWindow.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  stamps.push(now);
  rateWindow.set(ip, stamps);
  if (rateWindow.size > 10_000) {
    // Gelegentlich aufräumen, damit die Map nicht wuchert.
    for (const [key, list] of rateWindow) {
      if (!list.some((t) => now - t < 3_600_000)) rateWindow.delete(key);
    }
  }
  return stamps.length > LEAD_RATE_LIMIT;
}

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  // ── Fahrzeugbörse: Verkaufsfahrzeuge, anonymisiert ────────────────────────

  app.get("/public/board", async () => {
    const vehicles = await prisma.vehicle.findMany({
      where: { status: { in: ["VERKAUF", "AUFBEREITUNG"] } },
      orderBy: { updatedAt: "desc" },
      include: {
        photos: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }], take: 1 },
      },
    });
    // Kein Profit, kein Ankaufspreis, keine internen Notizen — nur das,
    // was ein Inserat braucht. VERKAUF zuerst (bereits aufbereitet).
    return vehicles
      .sort((a, b) => (a.status === "VERKAUF" ? -1 : 0) - (b.status === "VERKAUF" ? -1 : 0))
      .map((v) => ({
        id: v.id,
        title: `${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ""}`,
        firstRegistration: v.firstRegistration,
        mileageKm: v.mileageKm,
        fuel: v.fuel,
        transmission: v.transmission,
        color: v.color,
        price: v.targetSalePrice,
        description: v.description,
        equipment: v.equipment,
        coverPhoto: v.photos[0]?.filename ?? null,
        status: v.status,
      }));
  });

  // ── Ankaufsformular (Erstkontakt) ────────────────────────────────────────

  const leadSchema = z.object({
    sellerName: z.string().trim().min(2).max(120),
    sellerPhone: z.string().trim().min(6).max(50),
    sellerEmail: z.string().trim().max(200).optional(),
    make: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    variant: z.string().trim().max(120).optional(),
    mileageKm: z.coerce.number().int().min(0).max(2_000_000).optional(),
    year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1).optional(),
    askingPrice: z.coerce.number().min(0).max(5_000_000).optional(),
    message: z.string().trim().max(4000).optional(),
    consent: z.literal(true), // nDSG-Einwilligung zwingend
    honeypot: z.string().max(0).optional().default(""), // muss leer bleiben
  });

  app.post("/public/leads", async (req, reply) => {
    const ip = req.ip ?? "unbekannt";
    if (rateLimited(ip)) {
      return reply.code(429).send({ error: "Zu viele Anfragen — bitte später erneut versuchen." });
    }
    const parts = req.parts();
    const fields: Record<string, string> = {};
    const photos: { buffer: Buffer; mimetype: string; filename: string }[] = [];
    let ausweis: { buffer: Buffer; mimetype: string; filename: string } | null = null;
    try {
      for await (const part of parts) {
        if (part.type === "file") {
          const buf = await part.toBuffer();
          if (part.fieldname === "photos") {
            photos.push({ buffer: buf, mimetype: part.mimetype, filename: part.filename ?? "foto" });
          } else if (part.fieldname === "fahrzeugausweis") {
            ausweis = { buffer: buf, mimetype: part.mimetype, filename: part.filename ?? "ausweis" };
          }
          // Unbekannte Dateifelder werden still ignoriert.
        } else {
          fields[part.fieldname] = String(part.value ?? "");
        }
      }
    } catch (err) {
      if (err instanceof UploadError) return reply.code(400).send({ error: err.message });
      throw err;
    }

    let body;
    try {
      body = leadSchema.parse({
        ...fields,
        consent: fields.consent === "true",
        honeypot: fields.company ?? "",
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: "Bitte prüfe die Eingaben.", details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      }
      throw err;
    }

    const lead = await prisma.purchaseLead.create({
      data: {
        status: "NEU",
        channel: "WEBFORM",
        sellerName: body.sellerName,
        sellerPhone: body.sellerPhone,
        sellerEmail: body.sellerEmail || null,
        make: body.make,
        model: body.model,
        variant: body.variant || null,
        mileageKm: body.mileageKm ?? null,
        year: body.year ?? null,
        askingPrice: body.askingPrice ?? null,
        message: body.message || null,
      },
    });

    for (const photo of photos) {
      const filename = await saveUpload(LEADS_PHOTOS_DIR, photo.buffer, photo.mimetype);
      await prisma.leadFile.create({
        data: { leadId: lead.id, kind: "FOTO", filename, originalName: photo.filename },
      });
    }
    if (ausweis) {
      const filename = await saveUpload(LEADS_DOCS_DIR, ausweis.buffer, ausweis.mimetype);
      await prisma.leadFile.create({
        data: { leadId: lead.id, kind: "FAHRZEUGAUSWEIS", filename, originalName: ausweis.filename },
      });
    }

    // Lead-Benachrichtigung an den Betrieb (SMTP konfiguriert? sonst still skippen —
    // die Anfrage ist trotzdem sicher im Posteingang).
    try {
      const settings = await prisma.setting.findUnique({ where: { id: 1 } });
      if (settings?.email) {
        await sendMail(
          settings.email,
          `Neue Ankaufsanfrage: ${body.make} ${body.model} (${body.sellerName})`,
          [
            `Name: ${body.sellerName}`,
            `Telefon: ${body.sellerPhone}`,
            body.sellerEmail ? `E-Mail: ${body.sellerEmail}` : "",
            `Fahrzeug: ${body.make} ${body.model}${body.variant ? ` ${body.variant}` : ""}`,
            body.year ? `Jahrgang: ${body.year}` : "",
            body.mileageKm ? `Kilometer: ${body.mileageKm.toLocaleString("de-CH")} km` : "",
            body.askingPrice ? `Preisvorstellung: ${body.askingPrice.toLocaleString("de-CH")} CHF` : "",
            "",
            body.message || "(keine Notiz)",
            "",
            `Im System prüfen: Posteingang → Lead ${lead.id}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    } catch {
      req.log.warn("Lead-Benachrichtigung konnte nicht gesendet werden (SMTP?)");
    }

    return reply.code(201).send({ ok: true, id: lead.id });
  });
}
