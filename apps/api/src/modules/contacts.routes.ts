import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";

function normalize(value?: string | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function contactDisplayName(c: {
  type: "PRIVAT" | "FIRMA";
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (c.type === "FIRMA") return c.companyName ?? "Unbenannte Firma";
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unbenannter Kontakt";
}

export { contactDisplayName };

function serialize<T extends { type: "PRIVAT" | "FIRMA"; firstName: string | null; lastName: string | null; companyName: string | null }>(
  c: T,
): T & { displayName: string } {
  return { ...c, displayName: contactDisplayName(c) };
}

const contactCreateSchema = z.object({
  type: z.enum(["PRIVAT", "FIRMA"]).default("PRIVAT"),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  companyName: z.string().max(160).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  mobile: z.string().max(60).optional(),
  street: z.string().max(160).optional(),
  zip: z.string().max(16).optional(),
  city: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
});

const contactUpdateSchema = contactCreateSchema.partial().extend({
  type: z.enum(["PRIVAT", "FIRMA"]).optional(),
});

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.get("/contacts", { preHandler: authGuard }, async (req) => {
    const { q, type } = z
      .object({ q: z.string().max(120).optional(), type: z.enum(["PRIVAT", "FIRMA"]).optional() })
      .parse(req.query);

    const where = {
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { companyName: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { mobile: { contains: q } },
              { city: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { companyName: "asc" }],
      include: {
        _count: { select: { purchasesAsSeller: true, salesAsBuyer: true, inquiries: true } },
      },
    });
    return contacts.map((c) => ({
      ...serialize(c),
      dealCount: c._count.purchasesAsSeller + c._count.salesAsBuyer,
      inquiryCount: c._count.inquiries,
    }));
  });

  app.get("/contacts/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        purchasesAsSeller: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true, status: true, channel: true, purchasePrice: true, createdAt: true,
            vehicle: { select: { id: true, make: true, model: true, status: true } },
          },
        },
        salesAsBuyer: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true, status: true, salePrice: true, createdAt: true,
            vehicle: { select: { id: true, make: true, model: true, status: true } },
            invoices: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, isCredit: true, subject: true, totalAmount: true, vatAmount: true, issuedAt: true, dueAt: true, reminderLevel: true } },
            payments: { orderBy: { paidAt: "desc" }, select: { id: true, direction: true, amount: true, method: true, paidAt: true } },
          },
        },
        _count: { select: { inquiries: true, appointments: true } },
      },
    });
    if (!contact) return reply.code(404).send({ error: "Kontakt nicht gefunden" });
    // Rechnungshistorie des Kunden: alle Rechnungen/Gutschriften über seine
    // Verkaufsvorgänge plus die zugehörigen Zahlungen (offener Betrag je
    // Vorgang berechnet sich im Frontend aus totalAmount − EINGANG-Zahlungen).
    const invoices = contact.salesAsBuyer.flatMap((sale) =>
      sale.invoices.map((invoice) => ({
        ...invoice,
        totalAmount: invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
        vatAmount: invoice.vatAmount != null ? Number(invoice.vatAmount) : null,
        vehicle: sale.vehicle,
        saleId: sale.id,
      })),
    );
    const payments = contact.salesAsBuyer.flatMap((sale) =>
      sale.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
        vehicle: sale.vehicle,
        saleId: sale.id,
      })),
    );
    return {
      ...serialize(contact),
      inquiryCount: contact._count.inquiries,
      appointmentCount: contact._count.appointments,
      salesAsBuyer: contact.salesAsBuyer.map(({ invoices: _i, payments: _p, ...sale }) => sale),
      invoices,
      payments,
    };
  });

  app.post("/contacts", { preHandler: authGuard }, async (req, reply) => {
    const body = contactCreateSchema.parse(req.body);
    const contact = await prisma.contact.create({
      data: {
        type: body.type,
        firstName: normalize(body.firstName),
        lastName: normalize(body.lastName),
        companyName: normalize(body.companyName),
        email: normalize(body.email),
        phone: normalize(body.phone),
        mobile: normalize(body.mobile),
        street: normalize(body.street),
        zip: normalize(body.zip),
        city: normalize(body.city),
        notes: normalize(body.notes),
      },
    });
    await audit(req.user!.id, "CREATE", "Contact", contact.id, { displayName: contactDisplayName(contact) });
    return reply.code(201).send(serialize(contact));
  });

  app.put("/contacts/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = contactUpdateSchema.parse(req.body);
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "Kontakt nicht gefunden" });

    const data: Partial<Record<string, string | null>> = {};
    const fields = ["firstName", "lastName", "companyName", "email", "phone", "mobile", "street", "zip", "city", "notes"] as const;
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = normalize(body[f]);
    }
    if (body.type !== undefined) data.type = body.type;

    const contact = await prisma.contact.update({ where: { id }, data });
    await audit(req.user!.id, "UPDATE", "Contact", id, { fields: Object.keys(data) });
    return serialize(contact);
  });

  app.delete("/contacts/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: { _count: { select: { purchasesAsSeller: true, salesAsBuyer: true, inquiries: true, appointments: true } } },
    });
    if (!contact) return reply.code(404).send({ error: "Kontakt nicht gefunden" });
    const used =
      contact._count.purchasesAsSeller + contact._count.salesAsBuyer + contact._count.inquiries + contact._count.appointments;
    if (used > 0) {
      return reply.code(409).send({
        error: "Kontakt wird verwendet (An-/Verkäufe oder Anfragen vorhanden) und kann nicht gelöscht werden",
      });
    }
    await prisma.contact.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "Contact", id, { displayName: contactDisplayName(contact) });
    return { ok: true };
  });
}
