import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import { contactDisplayName } from "./contacts.routes.js";

const APPOINTMENT_TYPES = ["BESICHTIGUNG", "PROBEFAHRT", "RUECKRUF", "WERKSTATT", "SONSTIGES"] as const;
const APPOINTMENT_STATUSES = ["GEPLANT", "ERLEDIGT", "ABGESAGT"] as const;

const contactInclude = {
  select: { id: true, type: true, firstName: true, lastName: true, companyName: true, phone: true, mobile: true, email: true },
};

type ContactRow = { type: "PRIVAT" | "FIRMA"; firstName: string | null; lastName: string | null; companyName: string | null } | null;

function withContact<T extends { contact: ContactRow }>(appointment: T) {
  return {
    ...appointment,
    contact: appointment.contact ? { ...appointment.contact, displayName: contactDisplayName(appointment.contact) } : null,
  };
}

const idParams = z.object({ id: z.string().min(1) });
const nullableText = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.string().max(4000).nullable().optional(),
);

const appointmentCreateSchema = z.object({
  vehicleId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  contactId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  type: z.enum(APPOINTMENT_TYPES).default("BESICHTIGUNG"),
  title: z.string().min(1, "Titel fehlt").max(160),
  startsAt: z.coerce.date(),
  endsAt: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.date().nullable().optional()),
  notes: nullableText,
});

const appointmentUpdateSchema = appointmentCreateSchema.partial().extend({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
});

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  // Kalender: Zeitraum-Filter (von/bis) oder alles kommende.
  app.get("/appointments", { preHandler: authGuard }, async (req) => {
    const { from, to } = z
      .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(req.query);
    const appointments = await prisma.appointment.findMany({
      where: {
        ...(from || to
          ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      orderBy: { startsAt: "asc" },
      include: {
        vehicle: { select: { id: true, make: true, model: true, status: true } },
        contact: contactInclude,
      },
    });
    return appointments.map(withContact);
  });

  app.post("/appointments", { preHandler: authGuard }, async (req, reply) => {
    const body = appointmentCreateSchema.parse(req.body);
    if (body.vehicleId && !(await prisma.vehicle.findUnique({ where: { id: body.vehicleId } }))) {
      return reply.code(400).send({ error: "Fahrzeug nicht gefunden" });
    }
    if (body.contactId && !(await prisma.contact.findUnique({ where: { id: body.contactId } }))) {
      return reply.code(400).send({ error: "Kontakt nicht gefunden" });
    }
    const appointment = await prisma.appointment.create({
      data: {
        vehicleId: body.vehicleId ?? null,
        contactId: body.contactId ?? null,
        type: body.type,
        title: body.title.trim(),
        startsAt: body.startsAt,
        endsAt: body.endsAt ?? null,
        notes: body.notes ?? null,
      },
      include: {
        vehicle: { select: { id: true, make: true, model: true, status: true } },
        contact: contactInclude,
      },
    });
    await audit(req.user!.id, "CREATE", "Appointment", appointment.id, { type: appointment.type });
    return reply.code(201).send(withContact(appointment));
  });

  app.put("/appointments/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Termin nicht gefunden" });
    const body = appointmentUpdateSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.type !== undefined) data.type = body.type;
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.startsAt !== undefined) data.startsAt = body.startsAt;
    if (body.endsAt !== undefined) data.endsAt = body.endsAt ?? null;
    if (body.status !== undefined) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes ?? null;
    if (body.contactId !== undefined) data.contactId = body.contactId ?? null;
    const appointment = await prisma.appointment.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "Appointment", id, { fields: Object.keys(data) });
    return appointment;
  });

  app.delete("/appointments/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Termin nicht gefunden" });
    await prisma.appointment.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "Appointment", id);
    return { ok: true };
  });
}
