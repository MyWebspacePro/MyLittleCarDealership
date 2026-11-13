import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import { contactDisplayName } from "./contacts.routes.js";

const INQUIRY_CHANNELS = ["TELEFON", "WHATSAPP", "EMAIL", "AUTOSCOUT24", "WEBFORM", "PERSOENLICH", "SONSTIGE"] as const;

const contactInclude = {
  select: { id: true, type: true, firstName: true, lastName: true, companyName: true, phone: true, mobile: true, email: true },
};

type ContactRow = { type: "PRIVAT" | "FIRMA"; firstName: string | null; lastName: string | null; companyName: string | null } | null;

function withContact<T extends { contact: ContactRow }>(inquiry: T) {
  return {
    ...inquiry,
    contact: inquiry.contact ? { ...inquiry.contact, displayName: contactDisplayName(inquiry.contact) } : null,
  };
}

const idParams = z.object({ id: z.string().min(1) });
const nullableText = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.string().max(4000).nullable().optional(),
);
const nullableDate = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.coerce.date().nullable().optional(),
);

const inquiryCreateSchema = z.object({
  contactId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  contactName: nullableText,
  channel: z.enum(INQUIRY_CHANNELS).default("TELEFON"),
  subject: nullableText,
  summary: nullableText,
  nextFollowUpAt: nullableDate,
});

const inquiryUpdateSchema = inquiryCreateSchema.partial().extend({
  resolvedAt: nullableDate,
});

export async function inquiryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/vehicles/:id/inquiries", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const body = inquiryCreateSchema.parse(req.body);
    if (body.contactId && !(await prisma.contact.findUnique({ where: { id: body.contactId } }))) {
      return reply.code(400).send({ error: "Kontakt nicht gefunden" });
    }
    const inquiry = await prisma.inquiry.create({
      data: {
        vehicleId: id,
        contactId: body.contactId ?? null,
        contactName: body.contactName ?? null,
        channel: body.channel,
        subject: body.subject ?? null,
        summary: body.summary ?? null,
        nextFollowUpAt: body.nextFollowUpAt ?? null,
      },
      include: { contact: contactInclude },
    });
    // CRM-Historie: Fahrzeug-Anfrage erscheint auch in der Kunden-Timeline.
    if (inquiry.contactId) {
      await prisma.communicationLog.create({
        data: {
          contactId: inquiry.contactId,
          vehicleId: id,
          channel: inquiry.channel,
          direction: "NOTIZ",
          subject: inquiry.subject,
          body: inquiry.summary,
          source: "MANUAL",
          createdById: req.user!.id,
        },
      });
    }
    await audit(req.user!.id, "CREATE", "Inquiry", inquiry.id, { vehicleId: id, channel: inquiry.channel });
    return reply.code(201).send(withContact(inquiry));
  });

  app.put("/inquiries/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const existing = await prisma.inquiry.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Anfrage nicht gefunden" });
    const body = inquiryUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.contactName !== undefined) data.contactName = body.contactName ?? null;
    if (body.channel !== undefined) data.channel = body.channel;
    if (body.subject !== undefined) data.subject = body.subject ?? null;
    if (body.summary !== undefined) data.summary = body.summary ?? null;
    if (body.nextFollowUpAt !== undefined) data.nextFollowUpAt = body.nextFollowUpAt ?? null;
    if (body.resolvedAt !== undefined) data.resolvedAt = body.resolvedAt ?? null;
    const inquiry = await prisma.inquiry.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "Inquiry", id, { fields: Object.keys(data) });
    return inquiry;
  });

  app.delete("/inquiries/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const existing = await prisma.inquiry.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Anfrage nicht gefunden" });
    await prisma.inquiry.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "Inquiry", id);
    return { ok: true };
  });
}
