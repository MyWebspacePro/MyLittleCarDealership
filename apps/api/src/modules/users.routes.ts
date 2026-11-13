import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";

const roleSchema = z.enum(["ADMIN", "SALES", "FINANCE"]);
const publicUser = {
  id: true,
  email: true,
  name: true,
  jobTitle: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8, "Passwort: mindestens 8 Zeichen"),
  role: roleSchema.default("SALES"),
  jobTitle: z.string().max(120).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  role: roleSchema.optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "Passwort: mindestens 8 Zeichen").optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // Team-Liste: fuer alle eingeloggten Benutzer sichtbar (Dashboard, Zuweisungen).
  // Schreibende Operationen sind strikt ADMIN.
  app.get("/users", { preHandler: authGuard }, async () => {
    return prisma.user.findMany({ orderBy: { name: "asc" }, select: publicUser });
  });

  app.post("/users", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const email = body.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      return reply.code(409).send({ error: "E-Mail ist bereits vergeben" });
    }
    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 10),
        role: body.role,
        jobTitle: body.jobTitle || null,
      },
      select: publicUser,
    });
    await audit(req.user!.id, "CREATE", "User", user.id, { email });
    return reply.code(201).send(user);
  });

  app.put("/users/:id", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = updateSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: "Benutzer nicht gefunden" });

    if (body.active === false && target.id === req.user!.id) {
      return reply.code(400).send({ error: "Das eigene Konto kann nicht deaktiviert werden" });
    }

    // Der letzte aktive Administrator darf weder degradiert noch deaktiviert werden.
    const losesAdmin =
      (body.role !== undefined && body.role !== "ADMIN" && target.role === "ADMIN") ||
      (body.active === false && target.role === "ADMIN");
    if (losesAdmin) {
      const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
      if (activeAdmins <= 1) {
        return reply.code(400).send({ error: "Der letzte aktive Administrator kann nicht herabgestuft werden" });
      }
    }

    if (body.email) {
      const email = body.email.toLowerCase();
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash && clash.id !== id) {
        return reply.code(409).send({ error: "E-Mail ist bereits vergeben" });
      }
    }

    const data: {
      name?: string;
      email?: string;
      role?: Role;
      jobTitle?: string | null;
      active?: boolean;
      passwordHash?: string;
    } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.email !== undefined) data.email = body.email.toLowerCase();
    if (body.role !== undefined) data.role = body.role;
    if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle || null;
    if (body.active !== undefined) data.active = body.active;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.update({ where: { id }, data, select: publicUser });

    // Beim Deaktivieren oder Passwortwechsel alle Sessions beenden.
    if (body.active === false || body.password) {
      await prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await audit(req.user!.id, "UPDATE", "User", id, { fields: Object.keys(data) });
    return user;
  });

  app.delete("/users/:id", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: "Benutzer nicht gefunden" });
    if (target.id === req.user!.id) {
      return reply.code(400).send({ error: "Das eigene Konto kann nicht deaktiviert werden" });
    }
    if (target.role === "ADMIN") {
      const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
      if (activeAdmins <= 1) {
        return reply.code(400).send({ error: "Der letzte aktive Administrator kann nicht deaktiviert werden" });
      }
    }
    await prisma.user.update({ where: { id }, data: { active: false } });
    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(req.user!.id, "DEACTIVATE", "User", id);
    return { ok: true };
  });
}