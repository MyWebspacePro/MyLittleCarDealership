import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

// CRM-Kommunikationshistorie (Phase H): pro Kontakt eine Timeline —
// manuelle Protokolle, eingehende E-Mails, Webformular-Leads und
// Fahrzeug-Anfragen. Automatische Einträge schreiben lib/imap.ts (EMAIL),
// leads.routes convert (WEBFORM/MANUAL) und inquiries.routes (MANUAL).

const contactInclude = {
  contact: { select: { id: true, type: true, firstName: true, lastName: true, companyName: true } },
} as const;

function serialize(entry: {
  id: string;
  contactId: string | null;
  vehicleId: string | null;
  vehicle: { make: string; model: string; variant: string | null } | null;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  occurredAt: Date;
  source: string;
  emailLogId: string | null;
  createdAt: Date;
}) {
  return {
    id: entry.id,
    contactId: entry.contactId,
    vehicleId: entry.vehicleId,
    vehicleTitle: entry.vehicle ? `${entry.vehicle.make} ${entry.vehicle.model}${entry.vehicle.variant ? ` ${entry.vehicle.variant}` : ""}` : null,
    channel: entry.channel,
    direction: entry.direction,
    subject: entry.subject,
    body: entry.body,
    occurredAt: entry.occurredAt,
    source: entry.source,
    emailLogId: entry.emailLogId,
    createdAt: entry.createdAt,
  };
}

export async function communicationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/contacts/:id/communications", { preHandler: authGuard }, async (req) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const entries = await prisma.communicationLog.findMany({
      where: { contactId: id },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { ...contactInclude, vehicle: { select: { make: true, model: true, variant: true } } },
    });
    return entries.map(serialize);
  });

  app.post("/contacts/:id/communications", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true } });
    if (!contact) return reply.code(404).send({ error: "Kontakt nicht gefunden" });
    const body = z
      .object({
        channel: z.enum(["TELEFON", "WHATSAPP", "EMAIL", "AUTOSCOUT24", "WEBFORM", "PERSOENLICH", "SONSTIGE"]).default("TELEFON"),
        direction: z.enum(["EINGANG", "AUSGANG", "NOTIZ"]).default("AUSGANG"),
        subject: z.string().trim().max(200).nullish(),
        body: z.string().trim().max(8000).nullish(),
        vehicleId: z.string().min(1).nullish(),
        occurredAt: z.string().nullish(),
      })
      .parse(req.body ?? {});
    if (body.vehicleId) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id: body.vehicleId }, select: { id: true } });
      if (!vehicle) return reply.code(400).send({ error: "Fahrzeug nicht gefunden" });
    }
    const entry = await prisma.communicationLog.create({
      data: {
        contactId: id,
        vehicleId: body.vehicleId ?? null,
        channel: body.channel,
        direction: body.direction,
        subject: body.subject ?? null,
        body: body.body ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        source: "MANUAL",
        createdById: req.user!.id,
      },
      include: { ...contactInclude, vehicle: { select: { make: true, model: true, variant: true } } },
    });
    await audit(req.user!.id, "COMMUNICATION_CREATE", "CommunicationLog", entry.id, { contactId: id });
    return reply.code(201).send(serialize(entry));
  });

  app.delete("/communications/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.communicationLog.delete({ where: { id } });
    await audit(req.user!.id, "COMMUNICATION_DELETE", "CommunicationLog", id);
    return reply.code(204).send();
  });
}
