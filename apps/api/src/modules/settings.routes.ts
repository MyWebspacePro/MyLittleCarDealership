import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Setting } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";

const settingSchema = z.object({
  companyName: z.string().min(1, "Firmenname fehlt").max(120),
  addressLine: z.string().max(200).default(""),
  zip: z.string().max(20).default(""),
  city: z.string().max(100).default(""),
  phone: z.string().max(50).default(""),
  email: z.string().max(200).default(""),
  website: z.string().max(200).default(""),
  vatNumber: z.string().max(50).default(""),
  vatRateStandard: z.coerce.number().min(0).max(100),
  vatRateReduced: z.coerce.number().min(0).max(100),
  iban: z.string().max(50).default(""),
  bankName: z.string().max(100).default(""),
  paymentDays: z.coerce.number().int().min(0).max(365).default(30),
});

// Decimal aus Prisma als Zahl ausliefern (JSON wuerde sonst Strings erzeugen).
function serialize(s: Setting) {
  return {
    ...s,
    vatRateStandard: Number(s.vatRateStandard),
    vatRateReduced: Number(s.vatRateReduced),
  };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings", { preHandler: authGuard }, async () => {
    const s = await prisma.setting.findUnique({ where: { id: 1 } });
    if (!s) {
      // Ohne Seed: leeres Grundgerüst mit den Schema-Defaults.
      const created = await prisma.setting.create({ data: { id: 1, companyName: "Mein Betrieb" } });
      return serialize(created);
    }
    return serialize(s);
  });

  app.put("/settings", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req) => {
    const body = settingSchema.parse(req.body);
    const s = await prisma.setting.upsert({
      where: { id: 1 },
      create: { id: 1, ...body },
      update: body,
    });
    await audit(req.user!.id, "UPDATE", "Setting", "1");
    return serialize(s);
  });
}