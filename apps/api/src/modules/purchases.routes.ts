import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import { contactDisplayName } from "./contacts.routes.js";

const PURCHASE_CHANNELS = ["WEBFORM", "WHATSAPP", "EMAIL", "TELEFON", "PERSOENLICH", "AUTOSCOUT24", "SONSTIGE"] as const;
const PURCHASE_STATUSES = ["LEAD", "KALKULIERT", "ANGEBOT_ERSTELLT", "ANGEBOT_ANGENOMMEN", "ABGESCHLOSSEN", "ABGELEHNT"] as const;
const PAYMENT_METHODS = ["BAR", "UEBERWEISUNG", "EINTAUSCH"] as const;
const VALUATION_KINDS = ["AUFBEREITUNG", "REPARATUR", "SERVICE", "SONSTIGES"] as const;
const WORK_ORDER_TYPES = ["REPARATUR", "SERVICE", "AUFBEREITUNG", "MFK", "SONSTIGES"] as const;
const PROVIDER_TYPES = ["INTERN", "MARKENWERKSTATT", "PARTNERWERKSTATT", "EXTERN", "AUFBEREITER"] as const;

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
  z.string().max(8000).nullable().optional(),
);

const valuationItemSchema = z.object({
  kind: z.enum(VALUATION_KINDS),
  description: z.string().min(1).max(200),
  amount: z.coerce.number().min(0),
});

const purchaseCreateSchema = z.object({
  sellerId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  channel: z.enum(PURCHASE_CHANNELS).default("TELEFON"),
  paymentMethod: z.enum(PAYMENT_METHODS).default("UEBERWEISUNG"),
  purchasePrice: nullablePrice,
  estimatedSalePrice: nullablePrice,
  targetProfit: nullablePrice,
  notes: nullableText,
});

const purchaseUpdateSchema = z.object({
  sellerId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  channel: z.enum(PURCHASE_CHANNELS).optional(),
  status: z.enum(PURCHASE_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  purchasePrice: nullablePrice,
  estimatedSalePrice: nullablePrice,
  targetProfit: nullablePrice,
  paymentDueDate: nullableDate,
  purchasedAt: nullableDate,
  notes: nullableText,
  valuationItems: z.array(valuationItemSchema).optional(),
});

type PurchaseWithItems = {
  id: string;
  vehicleId: string;
  status: string;
  channel: string;
  paymentMethod: string;
  purchasePrice: unknown;
  recommendedPrice: unknown;
  targetProfit: unknown;
  estimatedSalePrice: unknown;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  seller: { type: "PRIVAT" | "FIRMA"; firstName: string | null; lastName: string | null; companyName: string | null } | null;
  vehicle: { id: string; make: string; model: string; variant: string | null; status: string };
  valuationItems: { id: string; kind: string; description: string; amount: unknown }[];
};

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function serializePurchase(d: PurchaseWithItems) {
  const costsTotal = d.valuationItems.reduce((sum, item) => sum + Number(item.amount), 0);
  const purchasePrice = num(d.purchasePrice);
  const estimatedSalePrice = num(d.estimatedSalePrice);
  return {
    ...d,
    purchasePrice,
    recommendedPrice: num(d.recommendedPrice),
    targetProfit: num(d.targetProfit),
    estimatedSalePrice,
    costsTotal,
    // Projektierter Gewinn mit dem aktuellen (oder vorgesehenen) Ankaufspreis.
    projectedProfit:
      estimatedSalePrice != null ? Math.round(estimatedSalePrice - costsTotal - (purchasePrice ?? 0)) : null,
    sellerName: d.seller ? contactDisplayName(d.seller) : null,
  };
}

/**
 * Ankaufs-Empfehlung: Zielverkaufspreis (AS24-Vergleich) minus erwartete
 * Kalkulationskosten minus Zielgewinn. Ohne Zielverkaufspreis keine Empfehlung.
 */
async function computeRecommendedPrice(dealId: string): Promise<number | null> {
  const deal = await prisma.purchaseDeal.findUnique({
    where: { id: dealId },
    include: { valuationItems: true },
  });
  if (!deal || deal.estimatedSalePrice == null) return null;
  const costs = deal.valuationItems.reduce((sum, item) => sum + Number(item.amount), 0);
  let targetProfit: number;
  if (deal.targetProfit != null) {
    targetProfit = Number(deal.targetProfit);
  } else {
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    targetProfit = Number(setting?.targetProfitDefault ?? 0);
  }
  return Math.max(0, Math.round(Number(deal.estimatedSalePrice) - costs - targetProfit));
}

// Fahrzeug-Status nur nach vorne schieben, nie zurück (z. B. nicht aus
// AUFBEREITUNG wieder auf GEKAUFT).
const PIPELINE_BEFORE_PURCHASE = ["ANGEFRAGT", "KALKULATION", "ANGEBOT", "GEKAUFT"];

// Kalkulationsart -> Auftragstyp -> sinnvoller Standard-Anbieter.
const VALUATION_TO_WORK_ORDER: Record<
  string,
  { type: (typeof WORK_ORDER_TYPES)[number]; providerType: (typeof PROVIDER_TYPES)[number] }
> = {
  AUFBEREITUNG: { type: "AUFBEREITUNG", providerType: "AUFBEREITER" },
  REPARATUR: { type: "REPARATUR", providerType: "PARTNERWERKSTATT" },
  SERVICE: { type: "SERVICE", providerType: "MARKENWERKSTATT" },
  SONSTIGES: { type: "SONSTIGES", providerType: "EXTERN" },
};

/**
 * Automatik beim Abschluss des Ankaufs: aus jeder Kalkulationsposition wird
 * ein geplanter Auftrag (Reparatur → Partnerwerkstatt, Service → Markenwerkstatt,
 * Aufbereitung → Aufbereiter, Sonstiges → extern) — die Schritte für die
 * Aufbereitung sind damit direkt eingeleitet.
 */
async function seedWorkOrdersFromValuation(vehicleId: string): Promise<void> {
  const existing = await prisma.workOrder.count({ where: { vehicleId } });
  if (existing > 0) return; // nie duplizieren
  const deal = await prisma.purchaseDeal.findUnique({
    where: { vehicleId },
    include: { valuationItems: true },
  });
  if (!deal || !deal.valuationItems.length) return;
  await prisma.workOrder.createMany({
    data: deal.valuationItems.map((item) => {
      const map = VALUATION_TO_WORK_ORDER[item.kind] ?? { type: "SONSTIGES", providerType: "EXTERN" };
      return {
        vehicleId,
        type: map.type,
        providerType: map.providerType,
        description: item.description,
        costEstimate: item.amount,
      };
    }),
  });
}

async function syncVehicleStatus(vehicleId: string, dealStatus: string): Promise<void> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { status: true } });
  if (!vehicle || !PIPELINE_BEFORE_PURCHASE.includes(vehicle.status)) return;
  const target = dealStatus === "ABGESCHLOSSEN" ? "GEKAUFT" : dealStatus === "ABGELEHNT" ? "ABGELEHNT" : null;
  if (target && vehicle.status !== target) {
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: target, statusChangedAt: new Date() } });
  }
}

export async function purchaseRoutes(app: FastifyInstance): Promise<void> {
  app.post("/vehicles/:id/purchase", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    if (await prisma.purchaseDeal.findUnique({ where: { vehicleId: id } })) {
      return reply.code(409).send({ error: "Für dieses Fahrzeug besteht bereits ein Ankaufsvorgang" });
    }
    const body = purchaseCreateSchema.parse(req.body);
    if (body.sellerId && !(await prisma.contact.findUnique({ where: { id: body.sellerId } }))) {
      return reply.code(400).send({ error: "Verkäufer-Kontakt nicht gefunden" });
    }
    const deal = await prisma.purchaseDeal.create({
      data: {
        vehicleId: id,
        sellerId: body.sellerId ?? null,
        channel: body.channel,
        paymentMethod: body.paymentMethod,
        purchasePrice: body.purchasePrice ?? null,
        estimatedSalePrice: body.estimatedSalePrice ?? null,
        targetProfit: body.targetProfit ?? null,
        notes: body.notes ?? null,
      },
      include: { valuationItems: true, seller: true, vehicle: { select: { id: true, make: true, model: true, variant: true, status: true } } },
    });
    // Automatik: Sobald kalkuliert wird, verlässt das Fahrzeug "Angefragt".
    if (vehicle.status === "ANGEFRAGT") {
      await prisma.vehicle.update({ where: { id }, data: { status: "KALKULATION", statusChangedAt: new Date() } });
    }
    const recommendedPrice = await computeRecommendedPrice(deal.id);
    const fresh = recommendedPrice == null
      ? deal
      : await prisma.purchaseDeal.update({ where: { id: deal.id }, data: { recommendedPrice }, include: { valuationItems: true, seller: true, vehicle: { select: { id: true, make: true, model: true, variant: true, status: true } } } });
    await audit(req.user!.id, "CREATE", "PurchaseDeal", deal.id, { vehicleId: id });
    return reply.code(201).send(serializePurchase(fresh));
  });

  app.put("/purchases/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const existing = await prisma.purchaseDeal.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Ankaufsvorgang nicht gefunden" });
    const body = purchaseUpdateSchema.parse(req.body);
    if (body.sellerId && !(await prisma.contact.findUnique({ where: { id: body.sellerId } }))) {
      return reply.code(400).send({ error: "Verkäufer-Kontakt nicht gefunden" });
    }

    const data: Record<string, unknown> = {};
    if (body.sellerId !== undefined) data.sellerId = body.sellerId ?? null;
    if (body.channel !== undefined) data.channel = body.channel;
    if (body.status !== undefined) data.status = body.status;
    if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod;
    if (body.purchasePrice !== undefined) data.purchasePrice = body.purchasePrice ?? null;
    if (body.estimatedSalePrice !== undefined) data.estimatedSalePrice = body.estimatedSalePrice ?? null;
    if (body.targetProfit !== undefined) data.targetProfit = body.targetProfit ?? null;
    if (body.paymentDueDate !== undefined) data.paymentDueDate = body.paymentDueDate ?? null;
    if (body.notes !== undefined) data.notes = body.notes ?? null;
    // Beim Abschluss das Kaufdatum automatisch setzen, falls noch leer.
    if (body.status === "ABGESCHLOSSEN" && existing.purchasedAt == null && body.purchasedAt === undefined) {
      data.purchasedAt = new Date();
    } else if (body.purchasedAt !== undefined) {
      data.purchasedAt = body.purchasedAt ?? null;
    }

    if (body.valuationItems !== undefined) {
      await prisma.valuationItem.deleteMany({ where: { purchaseDealId: id } });
      if (body.valuationItems.length) {
        await prisma.valuationItem.createMany({
          data: body.valuationItems.map((item) => ({
            purchaseDealId: id,
            kind: item.kind,
            description: item.description.trim(),
            amount: item.amount,
          })),
        });
      }
    }

    const deal = await prisma.purchaseDeal.update({
      where: { id },
      data,
      include: { valuationItems: { orderBy: { id: "asc" } }, seller: true, vehicle: { select: { id: true, make: true, model: true, variant: true, status: true } } },
    });
    const recommendedPrice = await computeRecommendedPrice(id);
    await prisma.purchaseDeal.update({ where: { id }, data: { recommendedPrice } });
    if (body.status !== undefined) {
      await syncVehicleStatus(deal.vehicleId, body.status);
      if (body.status === "ABGESCHLOSSEN" && existing.status !== "ABGESCHLOSSEN") {
        await seedWorkOrdersFromValuation(deal.vehicleId);
      }
    }
    await audit(req.user!.id, "UPDATE", "PurchaseDeal", id, { fields: Object.keys(data), items: body.valuationItems?.length });

    const fresh = await prisma.purchaseDeal.findUnique({
      where: { id },
      include: { valuationItems: { orderBy: { id: "asc" } }, seller: true, vehicle: { select: { id: true, make: true, model: true, variant: true, status: true } } },
    });
    return serializePurchase(fresh!);
  });
}
