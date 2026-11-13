import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

const PROVIDER_TYPES = ["INTERN", "MARKENWERKSTATT", "PARTNERWERKSTATT", "EXTERN", "AUFBEREITER"] as const;

const providerSchema = z.object({
  name: z.string().min(1, "Name fehlt").max(160),
  providerType: z.enum(PROVIDER_TYPES).default("PARTNERWERKSTATT"),
  phone: z.preprocess((v) => (v === "" ? null : v), z.string().max(60).nullable().optional()),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().max(200).nullable().optional()),
  notes: z.preprocess((v) => (v === "" ? null : v), z.string().max(2000).nullable().optional()),
});

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/providers", { preHandler: authGuard }, async () => {
    return prisma.provider.findMany({ orderBy: { name: "asc" } });
  });

  app.post("/providers", { preHandler: authGuard }, async (req, reply) => {
    const body = providerSchema.parse(req.body);
    const provider = await prisma.provider.create({
      data: {
        name: body.name.trim(),
        providerType: body.providerType,
        phone: body.phone ?? null,
        email: body.email ?? null,
        notes: body.notes ?? null,
      },
    });
    await audit(req.user!.id, "CREATE", "Provider", provider.id, { name: provider.name });
    return reply.code(201).send(provider);
  });

  app.put("/providers/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = providerSchema.partial().parse(req.body);
    const existing = await prisma.provider.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Anbieter nicht gefunden" });
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.providerType !== undefined) data.providerType = body.providerType;
    if (body.phone !== undefined) data.phone = body.phone ?? null;
    if (body.email !== undefined) data.email = body.email ?? null;
    if (body.notes !== undefined) data.notes = body.notes ?? null;
    const provider = await prisma.provider.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "Provider", id, { fields: Object.keys(data) });
    return provider;
  });

  app.delete("/providers/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const existing = await prisma.provider.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Anbieter nicht gefunden" });
    await prisma.provider.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "Provider", id, { name: existing.name });
    return { ok: true };
  });
}
