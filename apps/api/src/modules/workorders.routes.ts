import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

const WORK_ORDER_TYPES = ["REPARATUR", "SERVICE", "AUFBEREITUNG", "MFK", "SONSTIGES"] as const;
const PROVIDER_TYPES = ["INTERN", "MARKENWERKSTATT", "PARTNERWERKSTATT", "EXTERN", "AUFBEREITER"] as const;
const WORK_ORDER_STATUSES = ["GEPLANT", "IN_ARBEIT", "FERTIG", "ABGESCHLOSSEN"] as const;

const idParams = z.object({ id: z.string().min(1) });
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
  z.string().max(4000).nullable().optional(),
);

const workOrderCreateSchema = z.object({
  type: z.enum(WORK_ORDER_TYPES).default("REPARATUR"),
  providerType: z.enum(PROVIDER_TYPES).default("PARTNERWERKSTATT"),
  providerId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  providerName: nullableText,
  description: z.string().min(1, "Beschreibung fehlt").max(400),
  costEstimate: nullablePrice,
  plannedFor: nullableDate,
  notes: nullableText,
});

const workOrderUpdateSchema = z.object({
  type: z.enum(WORK_ORDER_TYPES).optional(),
  providerType: z.enum(PROVIDER_TYPES).optional(),
  providerId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  providerName: nullableText,
  description: z.string().min(1).max(400).optional(),
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  costEstimate: nullablePrice,
  costActual: nullablePrice,
  plannedFor: nullableDate,
  completedAt: nullableDate,
  notes: nullableText,
});

// Fahrzeug-Status nur nach vorne schieben (gleiches Muster wie im Ankauf).
const PIPELINE_BEFORE_PREP = ["ANGEFRAGT", "KALKULATION", "ANGEBOT", "GEKAUFT"];

async function syncVehicleToPrep(vehicleId: string): Promise<void> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { status: true } });
  if (vehicle && vehicle.status === "GEKAUFT") {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: "AUFBEREITUNG", statusChangedAt: new Date() },
    });
  }
}

export async function workOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post("/vehicles/:id/workorders", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const body = workOrderCreateSchema.parse(req.body);
    if (body.providerId && !(await prisma.provider.findUnique({ where: { id: body.providerId } }))) {
      return reply.code(400).send({ error: "Anbieter nicht gefunden" });
    }
    const workOrder = await prisma.workOrder.create({
      data: {
        vehicleId: id,
        type: body.type,
        providerType: body.providerType,
        providerId: body.providerId ?? null,
        providerName: body.providerName ?? null,
        description: body.description.trim(),
        costEstimate: body.costEstimate ?? null,
        plannedFor: body.plannedFor ?? null,
        notes: body.notes ?? null,
      },
    });
    // Automatik: Erster Auftrag bedeutet — die Aufbereitung läuft an.
    await syncVehicleToPrep(id);
    await audit(req.user!.id, "CREATE", "WorkOrder", workOrder.id, { vehicleId: id, type: workOrder.type });
    return reply.code(201).send(workOrder);
  });

  app.put("/workorders/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Auftrag nicht gefunden" });
    const body = workOrderUpdateSchema.parse(req.body);
    if (body.providerId && !(await prisma.provider.findUnique({ where: { id: body.providerId } }))) {
      return reply.code(400).send({ error: "Anbieter nicht gefunden" });
    }

    const data: Record<string, unknown> = {};
    if (body.type !== undefined) data.type = body.type;
    if (body.providerType !== undefined) data.providerType = body.providerType;
    if (body.providerId !== undefined) data.providerId = body.providerId ?? null;
    if (body.providerName !== undefined) data.providerName = body.providerName ?? null;
    if (body.description !== undefined) data.description = body.description.trim();
    if (body.status !== undefined) data.status = body.status;
    if (body.costEstimate !== undefined) data.costEstimate = body.costEstimate ?? null;
    if (body.costActual !== undefined) data.costActual = body.costActual ?? null;
    if (body.plannedFor !== undefined) data.plannedFor = body.plannedFor ?? null;
    if (body.notes !== undefined) data.notes = body.notes ?? null;
    // Abschlussdatum automatisch setzen, falls noch leer.
    if ((body.status === "FERTIG" || body.status === "ABGESCHLOSSEN") && existing.completedAt == null && body.completedAt === undefined) {
      data.completedAt = new Date();
    } else if (body.completedAt !== undefined) {
      data.completedAt = body.completedAt ?? null;
    }

    const workOrder = await prisma.workOrder.update({ where: { id }, data });
    if (body.status === "FERTIG" || body.status === "ABGESCHLOSSEN") {
      await syncVehicleToPrep(existing.vehicleId);
    }
    await audit(req.user!.id, "UPDATE", "WorkOrder", id, { fields: Object.keys(data) });
    return workOrder;
  });

  app.delete("/workorders/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Auftrag nicht gefunden" });
    await prisma.workOrder.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "WorkOrder", id, { vehicleId: existing.vehicleId });
    return { ok: true };
  });
}
