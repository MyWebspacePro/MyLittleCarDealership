import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import {
  PdfBuilder,
  formatDateDe,
  formatChf,
  renderPdf,
  type PdfCompany,
} from "../lib/pdf.js";
import { renderInvoicePdf } from "../lib/invoicePdf.js";
import { buildQrReference, formatInvoiceNumber } from "../lib/qrr.js";
import { DOCUMENTS_DIR, isSafeFilename, mimeForFilename, saveGeneratedFile } from "../lib/uploads.js";
import { contactDisplayName } from "./contacts.routes.js";

// Verkaufs-Abschluss (Phase E): Verkaufsvorgang, Kaufvertrag (OR 197/210),
// Schweizer QR-Rechnung, Zahlungen inkl. GwG-Check, Mahnwesen, Gutschrift,
// Leasing-Dossier und Zusammenfassungs-PDF fürs Offline-Archiv.
//
// MWST-Modell: Verkaufspreise sind Bruttopreise inkl. MWST (üblich bei
// Occasionen) — auf der Rechnung wird die im Preis enthaltene MWST
// ausgewiesen (Art. 38 MWSTG). Nicht MWST-pflichtige Abgaben (z. B.
// Kontrollscheine des Strassenverkehrsamts) werden separat ausgewiesen.

const GWG_CASH_THRESHOLD = 100_000; // GwG Art. 20: Barzahlung ab CHF 100'000
const VAT_RATE_FALLBACK = 8.1;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BAR: "Barzahlung",
  UEBERWEISUNG: "Banküberweisung",
  LEASING: "Leasing",
  FINANZIERUNG: "Finanzierung",
  EINTAUSCH: "Eintausch / Verrechnung",
};

const REMINDER_LABELS: Record<number, string> = {
  1: "Zahlungserinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung",
};
const REMINDER_DAYS = 10;

// Reihenfolge der Fahrzeug-Pipeline für die forward-only-Synchronisation.
const PIPELINE = [
  "ANGEFRAGT",
  "KALKULATION",
  "ANGEBOT",
  "GEKAUFT",
  "AUFBEREITUNG",
  "VERKAUF",
  "VERKAUFT",
  "ABGESCHLOSSEN",
] as const;

function canAdvance(from: string, to: string): boolean {
  return PIPELINE.indexOf(to as (typeof PIPELINE)[number]) >= PIPELINE.indexOf(from as (typeof PIPELINE)[number]);
}

async function company(): Promise<PdfCompany & { iban: string; bankName: string; qrIban: string }> {
  const s = await prisma.setting.findUnique({ where: { id: 1 } });
  return {
    companyName: s?.companyName ?? "Mein Händlerbetrieb",
    addressLine: s?.addressLine ?? "",
    zip: s?.zip ?? "",
    city: s?.city ?? "",
    phone: s?.phone ?? "",
    email: s?.email ?? "",
    website: s?.website ?? "",
    vatNumber: s?.vatNumber ?? "",
    iban: s?.iban ?? "",
    bankName: s?.bankName ?? "",
    qrIban: s?.qrIban ?? "",
  };
}

function vehicleTitle(v: { make: string; model: string; variant: string | null }): string {
  return `${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ""}`;
}

/** Empfänger-Zeilen aus einem Kontakt. */
function debtorLines(c: {
  type: "PRIVAT" | "FIRMA";
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
}): string[] {
  const name = contactDisplayName(c);
  return [
    name,
    c.type === "FIRMA" && c.companyName && name !== c.companyName ? c.companyName : "",
    c.street ?? "",
    [c.zip, c.city].filter(Boolean).join(" "),
  ].filter(Boolean);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

interface Totals {
  subtotalGross: number;
  netAmount: number;
  vatAmount: number;
  feesTotal: number;
  total: number;
}

/**
 * Beträge einer Verkaufsrechnung: Bruttopreis inkl. MWST als Basis,
 * Abzugsposten (Eintausch) vermindern den MWST-pflichtigen Betrag,
 * Abgaben kommen MWST-frei oben drauf.
 */
function computeTotals(salePrice: number, addonSum: number, deduction: number, fees: number, vatRate: number): Totals {
  const subtotalGross = Math.max(0, round2(salePrice + addonSum - deduction));
  const netAmount = round2(subtotalGross / (1 + vatRate / 100));
  const vatAmount = round2(subtotalGross - netAmount);
  return { subtotalGross, netAmount, vatAmount, feesTotal: round2(fees), total: round2(subtotalGross + fees) };
}

/** Nächste freie Rechnungsnummer (Jahrespräfix) + QRR aus dem Zähler. */
async function allocateInvoiceIdentity(vatContext: { qrIban: string }): Promise<{ number: string; qrReference: string | null }> {
  const year = new Date().getFullYear();
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  const invoiceCounter = (setting?.invoiceCounter ?? 1) + 1;
  const qrrCounter = (setting?.qrrCounter ?? 1) + 1;
  await prisma.setting.update({ where: { id: 1 }, data: { invoiceCounter, qrrCounter } });
  const number = formatInvoiceNumber(year, invoiceCounter - 1);
  let qrReference: string | null = null;
  if (vatContext.qrIban) {
    qrReference = buildQrReference(vatContext.qrIban, qrrCounter - 1);
  }
  return { number, qrReference };
}

async function saveVehicleDocument(vehicleId: string, documentType: string, title: string, buffer: Buffer) {
  const filename = await saveGeneratedFile(DOCUMENTS_DIR, buffer);
  return prisma.generatedDocument.create({
    data: { vehicleId, documentType: documentType as never, title, filePath: filename },
  });
}

/** Offener Betrag einer Rechnung: Total − eingegangene EINGANG-Zahlungen. */
function openAmount(total: number, payments: { direction: string; amount: unknown }[]): number {
  const paid = payments
    .filter((p) => p.direction === "EINGANG")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return round2(Math.max(0, total - paid));
}

async function loadSaleFull(vehicleId: string) {
  return prisma.saleDeal.findUnique({
    where: { vehicleId },
    include: {
      vehicle: true,
      buyer: {
        select: {
          type: true,
          firstName: true,
          lastName: true,
          companyName: true,
          street: true,
          zip: true,
          city: true,
          email: true,
        },
      },
      addons: { orderBy: { createdAt: "asc" as const } },
      payments: { orderBy: { paidAt: "asc" as const } },
    },
  });
}

/** Bausteine der Rechnungs-Positionen aus Verkaufsvorgang + Zusatzleistungen. */
function invoicePositions(
  vehicleTitleText: string,
  salePrice: number,
  addons: { name: string; price: unknown }[],
): { description: string; amount: number }[] {
  const positions = [{ description: vehicleTitleText, amount: salePrice }];
  for (const addon of addons) {
    positions.push({ description: addon.name, amount: Number(addon.price ?? 0) });
  }
  return positions;
}

export async function salesRoutes(app: FastifyInstance): Promise<void> {
  // ── Verkaufsvorgang (upsert) ─────────────────────────────────────────────

  const saleBody = z.object({
    buyerId: z.string().min(1).nullish(),
    status: z.enum(["INTERESSENT", "RESERVIERT", "VERKAUFT", "ABGESCHLOSSEN"]).default("INTERESSENT"),
    salePrice: z.number().nonnegative().nullish(),
    paymentMethod: z.enum(["BAR", "UEBERWEISUNG", "LEASING", "FINANZIERUNG"]).default("UEBERWEISUNG"),
    leasingPartner: z.string().trim().max(120).nullish(),
    leasingMonthlyRate: z.number().nonnegative().nullish(),
    leasingTermMonths: z.number().int().positive().max(240).nullish(),
    leasingDownPayment: z.number().nonnegative().nullish(),
    tradeInCredit: z.number().nonnegative().nullish(),
    tradeInDescription: z.string().trim().max(200).nullish(),
    soldAt: z.string().nullish(),
    notes: z.string().max(4000).nullish(),
  });

  app.put("/vehicles/:id/sale", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = saleBody.parse(req.body ?? {});
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });

    const data = {
      buyerId: body.buyerId ?? null,
      status: body.status,
      salePrice: body.salePrice ?? null,
      paymentMethod: body.paymentMethod,
      leasingPartner: body.leasingPartner ?? null,
      leasingMonthlyRate: body.leasingMonthlyRate ?? null,
      leasingTermMonths: body.leasingTermMonths ?? null,
      leasingDownPayment: body.leasingDownPayment ?? null,
      tradeInCredit: body.tradeInCredit ?? null,
      tradeInDescription: body.tradeInDescription ?? null,
      soldAt: body.soldAt ? new Date(body.soldAt) : body.status === "VERKAUFT" || body.status === "ABGESCHLOSSEN" ? new Date() : null,
      notes: body.notes ?? null,
    };
    const sale = await prisma.saleDeal.upsert({
      where: { vehicleId: id },
      create: { ...data, vehicleId: id },
      update: data,
    });

    // Pipeline-Verknüpfung: VERKAUFT/ABGESCHLOSSEN schiebt das Fahrzeug
    // passend weiter (nie rückwärts).
    if (body.status === "VERKAUFT" && canAdvance(vehicle.status, "VERKAUFT")) {
      await prisma.vehicle.update({ where: { id }, data: { status: "VERKAUFT", statusChangedAt: new Date() } });
    } else if (body.status === "ABGESCHLOSSEN" && canAdvance(vehicle.status, "ABGESCHLOSSEN")) {
      await prisma.vehicle.update({ where: { id }, data: { status: "ABGESCHLOSSEN", statusChangedAt: new Date() } });
    }
    await audit(req.user!.id, "SALE_UPSERT", "SaleDeal", sale.id, { vehicleId: id, status: body.status });
    return sale;
  });

  // ── Zusatzleistungen (Occasionsgarantie, Pneus, …) ───────────────────────

  const addonBody = z.object({
    name: z.string().trim().min(1).max(120),
    provider: z.string().trim().max(120).nullish(),
    price: z.number().nonnegative().nullish(),
  });

  app.post("/vehicles/:id/addons", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = addonBody.parse(req.body ?? {});
    const sale = await prisma.saleDeal.findUnique({ where: { vehicleId: id } });
    if (!sale) return reply.code(400).send({ error: "Zuerst einen Verkaufsvorgang erfassen." });
    const addon = await prisma.saleAddon.create({
      data: { saleDealId: sale.id, name: body.name, provider: body.provider ?? null, price: body.price ?? null },
    });
    await audit(req.user!.id, "SALE_ADDON_CREATE", "SaleAddon", addon.id, { vehicleId: id });
    return addon;
  });

  app.delete("/sale-addons/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.saleAddon.delete({ where: { id } });
    await audit(req.user!.id, "SALE_ADDON_DELETE", "SaleAddon", id);
    return reply.code(204).send();
  });

  // ── Kaufvertrag (OR 197 ff., Art. 210 OR) ────────────────────────────────

  app.post("/vehicles/:id/kaufvertrag-pdf", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const sale = await loadSaleFull(id);
    if (!sale) return reply.code(400).send({ error: "Zuerst einen Verkaufsvorgang erfassen (Käufer, Preis)." });
    if (!sale.salePrice) return reply.code(400).send({ error: "Zuerst einen Verkaufspreis erfassen." });
    if (!sale.buyer) return reply.code(400).send({ error: "Zuerst einen Käufer (Kontakt) zuordnen." });
    const buyer = sale.buyer;

    const c = await company();
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    const warrantyText =
      setting?.warrantyText?.trim() ||
      "Das Fahrzeug wird im Zustand «wie besichtigt und probefahren» verkauft. Eine Gewährleistung wird ausdrücklich ausgeschlossen, soweit dies rechtlich zulässig ist. Haftung bleibt vorbehalten für verheimlichte oder zugesicherte Mängel.";
    const now = new Date();
    const tradeIn = sale.tradeInCredit;

    const buffer = await renderPdf((doc) => {
      const b = new PdfBuilder(doc);
      b.header(c, "Kaufvertrag", now);
      b.addressBlock(debtorLines(buyer));
      b.paragraph(
        `zwischen ${c.companyName}, ${c.addressLine}, ${c.zip} ${c.city} (Verkäufer) und ${debtorLines(buyer).join(", ")} (Käufer) wird folgender Kaufvertrag abgeschlossen:`,
      );

      b.sectionTitle("§ 1 Vertragsgegenstand");
      b.keyValues([
        ["Marke / Modell / Typ", vehicleTitle(vehicle)],
        ["Stammnummer (CHID)", vehicle.chassisNumber ?? "—"],
        ["Erste Inverkehrtsetzung", vehicle.firstRegistration ? formatDateDe(vehicle.firstRegistration) : "—"],
        ["Kilometerstand bei Übergabe", vehicle.mileageKm != null ? `${vehicle.mileageKm.toLocaleString("de-CH")} km` : "—"],
        ["Kennzeichen", vehicle.plates ?? "—"],
        ["Letzte MFK", vehicle.mfkUntil ? formatDateDe(vehicle.mfkUntil) : "—"],
        ["Serviceheft", vehicle.hasServiceBook ? "vorhanden" : "nicht vorhanden"],
        ...(vehicle.description ? ([["Zustand/Bemerkungen", vehicle.description]] as [string, string][]) : []),
      ]);

      b.sectionTitle("§ 2 Kaufpreis und Zahlung");
      const addonSum = sale.addons.reduce((sum, a) => sum + Number(a.price ?? 0), 0);
      const total = Math.max(0, Number(sale.salePrice) + addonSum - Number(tradeIn ?? 0));
      b.keyValues([
        ["Kaufpreis (inkl. MWST)", formatChf(Number(sale.salePrice))],
        ...(sale.addons.length ? sale.addons.map((a) => [a.name, formatChf(Number(a.price ?? 0))] as [string, string]) : []),
        ...(tradeIn ? ([["Abzugsposten Eintausch", `− ${formatChf(Number(tradeIn))}`]] as [string, string][]) : []),
        ["Total", formatChf(total)],
        ["Zahlungsart", PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod],
        ...(sale.paymentMethod === "LEASING" && sale.leasingPartner
          ? ([
              ["Leasingpartner", sale.leasingPartner],
              ...(sale.leasingMonthlyRate ? ([["Monatsrate", formatChf(Number(sale.leasingMonthlyRate))]] as [string, string][]) : []),
              ...(sale.leasingTermMonths ? ([["Vertragsdauer", `${sale.leasingTermMonths} Monate`]] as [string, string][]) : []),
              ...(sale.leasingDownPayment ? ([["Anzahlung", formatChf(Number(sale.leasingDownPayment))]] as [string, string][]) : []),
            ] as [string, string][])
          : []),
        ...(c.iban ? ([["Bankverbindung", `${c.iban}${c.bankName ? ` (${c.bankName})` : ""}`]] as [string, string][]) : []),
      ]);
      b.paragraph(
        "Der Kaufpreis ist bei Vertragsabschluss fällig. Das Eigentum geht erst mit vollständiger Zahlung auf den Käufer über (Eigentumsvorbehalt); bis dahin bleibt das Fahrzeug im Eigentum des Verkäufers.",
      );

      b.sectionTitle("§ 3 Übergabe");
      b.bulletList([
        "Das Fahrzeug wird mit dem Fahrzeugausweis (Doppel) übergeben.",
        "Serviceheft und sämtliche Schlüssel werden übergeben (Zuständigkeit: siehe Übergabeprotokoll).",
        "Die Übertragung des Fahrzeugs wird vom Verkäufer am zuständigen Strassenverkehrsamt vorgenommen; die Gebühr trägt der Käufer.",
        "Der Käufer übernimmt das Fahrzeug am heutigen Tag im besichtigen Zustand und bestätigt die ordnungsgemässe Übergabe mit seiner Unterschrift.",
      ]);

      b.sectionTitle("§ 4 Zustand und Gewährleistung");
      b.paragraph(warrantyText);

      b.sectionTitle("§ 5 Rücktritt und Schlusserklärung");
      b.paragraph(
        "Der Rücktritt vom Vertrag ist gemäss Art. 210 OR nur innerhalb der gesetzlichen Zwei-Jahres-Frist zulässig, sofern keine ausdrücklich vereinbarte Abbedingung besteht. Mit Unterzeichnung bestätigen beide Parteien: Alle Vereinbarungen sind in diesem Vertrag schriftlich festgehalten; mündliche Nebenabreden bestehen nicht. Änderungen bedürfen der Schriftform.",
      );
      b.sectionTitle("Übergabe-Checkliste");
      b.bulletList([
        "Fahrzeugausweis (Doppel) — übergeben: [ ]  fehlt: [ ]",
        "Serviceheft — übergeben: [ ]  fehlt: [ ]",
        "Sämtliche Schlüssel (Anzahl: ______) — übergeben: [ ]",
        "Kontrollscheibe / Abmeldung vorbereitet: [ ]",
        "MFK gültig bis " + (vehicle.mfkUntil ? formatDateDe(vehicle.mfkUntil) : "—") + ": [ ]",
        "Leasing-/Finanzierungsdossier übergeben (falls zutreffend): [ ]",
      ]);

      b.signatures(c.companyName, contactDisplayName(buyer));
      b.footerNote(
        "Erstellt automatisch mit MyLittleCarDealership. Standardvorlage — keine Rechtsberatung; individuelle Klauseln pflegen Sie in den Einstellungen.",
      );
    });

    const document = await saveVehicleDocument(id, "KAUFVERTRAG", `Kaufvertrag ${vehicleTitle(vehicle)}`, buffer);
    await audit(req.user!.id, "PDF_KAUFVERTRAG", "Vehicle", id, { documentId: document.id });
    return document;
  });

  // ── Rechnung mit Schweizer QR-Teil ───────────────────────────────────────

  const invoiceBody = z.object({
    subject: z.string().trim().max(200).nullish(),
    fees: z.array(z.object({ description: z.string().trim().min(1).max(200), amount: z.number().nonnegative() })).default([]),
    notes: z.array(z.string().max(300)).max(10).nullish(),
    send: z.boolean().default(false),
  });

  async function buildInvoiceRenderInput(vehicleId: string) {
    const sale = await loadSaleFull(vehicleId);
    if (!sale || !sale.salePrice) return null;
    const c = await company();
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    const vatRate = Number(setting?.vatRateStandard ?? VAT_RATE_FALLBACK);
    const addonSum = sale.addons.reduce((sum, a) => sum + Number(a.price ?? 0), 0);
    const fees = 0; // Abgaben werden beim Rechnungserstellen übergeben und in der Invoice gespeichert
    const totals = computeTotals(
      Number(sale.salePrice),
      addonSum,
      Number(sale.tradeInCredit ?? 0),
      fees,
      vatRate,
    );
    return { sale, c, vatRate, addonSum, totals, setting };
  }

  app.post("/vehicles/:id/invoice", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = invoiceBody.parse(req.body ?? {});
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const ctx = await buildInvoiceRenderInput(id);
    if (!ctx) return reply.code(400).send({ error: "Zuerst einen Verkaufsvorgang mit Verkaufspreis erfassen." });
    if (!ctx.sale.buyer) return reply.code(400).send({ error: "Zuerst einen Käufer (Kontakt) zuordnen." });
    const existing = await prisma.invoice.findFirst({ where: { saleDealId: ctx.sale.id, status: { not: "STORNIERT" }, isCredit: false } });
    if (existing) return reply.code(409).send({ error: `Es besteht bereits eine offene Rechnung (${existing.number}).` });

    const feesTotal = body.fees.reduce((sum, f) => sum + f.amount, 0);
    const totals = computeTotals(
      Number(ctx.sale.salePrice),
      ctx.addonSum,
      Number(ctx.sale.tradeInCredit ?? 0),
      feesTotal,
      ctx.vatRate,
    );
    const { number, qrReference } = await allocateInvoiceIdentity({ qrIban: ctx.c.qrIban });
    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + (ctx.setting?.paymentDays ?? 30) * 86_400_000);

    const invoice = await prisma.invoice.create({
      data: {
        number,
        saleDealId: ctx.sale.id,
        subject: body.subject ?? `Occasion ${vehicleTitle(vehicle)}`,
        status: "VERSANDT",
        netAmount: totals.netAmount,
        vatRate: ctx.vatRate,
        vatAmount: totals.vatAmount,
        feesAmount: round2(feesTotal),
        feesDescription: body.fees.map((f) => f.description).join("; ") || null,
        totalAmount: totals.total,
        issuedAt,
        dueAt,
        qrReference,
      },
    });

    const buffer = await renderInvoicePdf(
      {
        company: ctx.c,
        invoiceNumber: number,
        qrReference,
        issuedAt,
        dueAt,
        debtorLines: debtorLines(ctx.sale.buyer),
        subject: body.subject ?? `Occasion ${vehicleTitle(vehicle)} — Verkaufsrechnung`,
        positions: invoicePositions(vehicleTitle(vehicle), Number(ctx.sale.salePrice), ctx.sale.addons),
        fees: body.fees,
        deductions: ctx.sale.tradeInCredit
          ? [{ description: `Abzugsposten Eintausch${ctx.sale.tradeInDescription ? ` (${ctx.sale.tradeInDescription})` : ""}`, amount: Number(ctx.sale.tradeInCredit) }]
          : [],
        vatRate: ctx.vatRate,
        subtotalGross: totals.subtotalGross,
        vatAmount: totals.vatAmount,
        netAmount: totals.netAmount,
        feesTotal: totals.feesTotal,
        total: totals.total,
        notes: body.notes ?? undefined,
      },
      { withQr: true },
    );
    const filename = await saveGeneratedFile(DOCUMENTS_DIR, buffer);
    const document = await prisma.generatedDocument.create({
      data: { vehicleId: id, documentType: "RECHNUNG", title: `Rechnung ${number} — ${vehicleTitle(vehicle)}`, filePath: filename },
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: filename } });
    await audit(req.user!.id, "INVOICE_CREATE", "Invoice", invoice.id, { vehicleId: id, number, total: totals.total });
    return { invoice: { ...invoice, pdfPath: filename }, documentId: document.id };
  });

  // ── Rechnungsliste + Detail ──────────────────────────────────────────────

  app.get("/invoices", { preHandler: authGuard }, async () => {
    const invoices = await prisma.invoice.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        saleDeal: {
          include: {
            vehicle: { select: { make: true, model: true, variant: true } },
            buyer: { select: { type: true, firstName: true, lastName: true, companyName: true } },
          },
        },
      },
    });
    return invoices.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      subject: inv.subject,
      isCredit: inv.isCredit,
      totalAmount: inv.totalAmount != null ? Number(inv.totalAmount) : null,
      vatAmount: inv.vatAmount != null ? Number(inv.vatAmount) : null,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      reminderLevel: inv.reminderLevel,
      reminderDueAt: inv.reminderDueAt,
      qrReference: inv.qrReference,
      saleDealId: inv.saleDealId,
      vehicleTitle: inv.saleDeal ? vehicleTitle(inv.saleDeal.vehicle) : null,
      buyerName: inv.saleDeal?.buyer ? contactDisplayName(inv.saleDeal.buyer) : null,
      createdAt: inv.createdAt,
    }));
  });

  // ── Rechnungs-PDF herunterladen (archiviertes Exemplar) ─────────────────

  app.get("/invoices/:id/pdf", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return reply.code(404).send({ error: "Rechnung nicht gefunden" });
    if (!invoice.pdfPath || !isSafeFilename(invoice.pdfPath)) {
      return reply.code(404).send({ error: "Für diese Rechnung wurde noch kein PDF erzeugt." });
    }
    const full = path.join(DOCUMENTS_DIR, invoice.pdfPath);
    if (!(await stat(full).then((s2) => s2.isFile()).catch(() => false))) {
      return reply.code(404).send({ error: "PDF-Datei nicht gefunden." });
    }
    reply.header("Content-Type", mimeForFilename(invoice.pdfPath) ?? "application/pdf");
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${invoice.number}.pdf`)}`);
    return reply.send(createReadStream(full));
  });

  // ── Mahnwesen: Zahlungserinnerung / 1. / 2. Mahnung als PDF ─────────────

  app.post("/invoices/:id/reminder", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const { level } = z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).parse(req.body ?? {});
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        saleDeal: { include: { vehicle: true, buyer: { select: { type: true, firstName: true, lastName: true, companyName: true, street: true, zip: true, city: true } }, addons: true, payments: true } },
      },
    });
    if (!invoice) return reply.code(404).send({ error: "Rechnung nicht gefunden" });
    if (invoice.isCredit) return reply.code(400).send({ error: "Für eine Gutschrift gibt es kein Mahnwesen." });
    if (invoice.status === "BEZAHLT" || invoice.status === "STORNIERT") {
      return reply.code(400).send({ error: "Rechnung ist bezahlt bzw. storniert — kein Mahnwesen nötig." });
    }
    if (level <= invoice.reminderLevel) {
      return reply.code(400).send({ error: `Nächste Stufe wäre ${(invoice.reminderLevel + 1)} (aktuell: Stufe ${invoice.reminderLevel}).` });
    }
    const c = await company();
    const sale = invoice.saleDeal;
    if (!sale || !sale.vehicle) return reply.code(400).send({ error: "Rechnung ist keinem Fahrzeug zugeordnet." });

    const paid = sale.payments.filter((p) => p.direction === "EINGANG").reduce((sum, p) => sum + Number(p.amount), 0);
    const open = openAmount(Number(invoice.totalAmount ?? 0), sale.payments);
    const reminderDueAt = new Date(Date.now() + REMINDER_DAYS * 86_400_000);

    const buffer = await renderInvoicePdf(
      {
        company: c,
        invoiceNumber: invoice.number,
        qrReference: invoice.qrReference,
        issuedAt: new Date(),
        dueAt: reminderDueAt,
        debtorLines: sale.buyer ? debtorLines(sale.buyer) : ["Käufer/in (Adresse nachtragen)"],
        subject: `${REMINDER_LABELS[level]} — Rechnung ${invoice.number}`,
        positions: [
          { description: `Rechnung ${invoice.number} — ${sale.vehicle ? vehicleTitle(sale.vehicle) : ""}`, amount: Number(invoice.totalAmount ?? 0) },
          ...(paid > 0 ? [{ description: "Eingegangene Zahlungen", amount: -round2(paid) }] : []),
        ],
        fees: [],
        deductions: [],
        vatRate: Number(invoice.vatRate ?? VAT_RATE_FALLBACK),
        subtotalGross: Number(invoice.totalAmount ?? 0),
        vatAmount: Number(invoice.vatAmount ?? 0),
        netAmount: Number(invoice.netAmount ?? 0),
        feesTotal: Number(invoice.feesAmount ?? 0),
        total: open,
        notes: [`Offener Betrag zum Fälligkeitsdatum ${invoice.dueAt ? formatDateDe(invoice.dueAt) : "—"}: ${formatChf(open)}.`],
        reminder: {
          label: REMINDER_LABELS[level] ?? "Zahlungserinnerung",
          openAmount: open,
          fristDays: REMINDER_DAYS,
          legalNote: level >= 3,
          originalNumber: invoice.number,
          originalDate: invoice.issuedAt ?? invoice.createdAt,
        },
      },
      { withQr: true },
    );

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        reminderLevel: level,
        lastReminderAt: new Date(),
        reminderDueAt,
        status: invoice.status === "ENTWURF" ? "VERSANDT" : invoice.status,
        issuedAt: invoice.issuedAt ?? new Date(),
      },
    });
    const filename = await saveGeneratedFile(DOCUMENTS_DIR, buffer);
    const document = await prisma.generatedDocument.create({
      data: {
        vehicleId: sale.vehicleId,
        documentType: "MAHNUNG",
        title: `${REMINDER_LABELS[level]} Rechnung ${invoice.number}`,
        filePath: filename,
      },
    });
    await audit(req.user!.id, "INVOICE_REMINDER", "Invoice", id, { level, open });
    return { invoice: updated, documentId: document.id };
  });

  // ── Gutschrift / Storno ──────────────────────────────────────────────────

  app.post("/invoices/:id/credit-note", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body ?? {});
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { saleDeal: { include: { vehicle: true, buyer: { select: { type: true, firstName: true, lastName: true, companyName: true, street: true, zip: true, city: true } }, addons: true } } },
    });
    if (!invoice) return reply.code(404).send({ error: "Rechnung nicht gefunden" });
    if (invoice.isCredit) return reply.code(400).send({ error: "Eine Gutschrift kann nicht selbst storniert werden." });
    const c = await company();
    const creditBuyer = invoice.saleDeal?.buyer ?? null;
    const { number } = await allocateInvoiceIdentity({ qrIban: c.qrIban });
    const total = Number(invoice.totalAmount ?? 0);
    const credit = await prisma.invoice.create({
      data: {
        number,
        saleDealId: invoice.saleDealId,
        subject: `Gutschrift zu Rechnung ${invoice.number}`,
        status: "VERSANDT",
        netAmount: invoice.netAmount != null ? -Number(invoice.netAmount) : null,
        vatRate: invoice.vatRate,
        vatAmount: invoice.vatAmount != null ? -Number(invoice.vatAmount) : null,
        feesAmount: invoice.feesAmount != null ? -Number(invoice.feesAmount) : null,
        feesDescription: invoice.feesDescription,
        totalAmount: -total,
        issuedAt: new Date(),
        dueAt: new Date(),
        qrReference: null,
        isCredit: true,
        reason,
        creditForId: invoice.id,
      },
    });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "STORNIERT" } });

    const buffer = await renderPdf((doc) => {
      const b = new PdfBuilder(doc);
      b.header(c, `Gutschrift ${number}`, new Date());
      b.addressBlock(creditBuyer ? debtorLines(creditBuyer) : ["Käufer/in (Adresse nachtragen)"]);
      b.paragraph(`Gutschrift zur Rechnung ${invoice.number} vom ${invoice.issuedAt ? formatDateDe(invoice.issuedAt) : "—"}.`);
      b.keyValues([
        ["Grund", reason],
        ["Betrag", formatChf(total)],
        ["davon MWST", formatChf(Number(invoice.vatAmount ?? 0))],
      ]);
      b.paragraph(
        "Der gutgeschriebene Betrag wird auf dem Zahlungsweg der ursprünglichen Rechnung zurückerstattet bzw. mit offenen Beträgen verrechnet. Mit dieser Gutschrift ist die oben genannte Rechnung storniert.",
      );
      b.footerNote(`MWST-Nr. ${c.vatNumber} · Erstellt automatisch mit MyLittleCarDealership.`);
    });
    const filename = await saveGeneratedFile(DOCUMENTS_DIR, buffer);
    const document = await prisma.generatedDocument.create({
      data: {
        vehicleId: invoice.saleDeal?.vehicleId ?? null,
        documentType: "RECHNUNG",
        title: `Gutschrift ${number} — ${invoice.saleDeal?.vehicle ? vehicleTitle(invoice.saleDeal.vehicle) : invoice.number}`,
        filePath: filename,
      },
    });
    await audit(req.user!.id, "INVOICE_CREDIT", "Invoice", credit.id, { creditFor: invoice.id, total: -total, reason });
    return { invoice: credit, documentId: document.id };
  });

  // ── Zahlungen (GwG-Check bei Bar ab CHF 100'000) ────────────────────────

  const paymentBody = z.object({
    direction: z.enum(["EINGANG", "AUSGANG"]).default("EINGANG"),
    saleDealId: z.string().nullish(),
    purchaseDealId: z.string().nullish(),
    amount: z.number().positive(),
    method: z.enum(["BAR", "UEBERWEISUNG", "LEASING", "SONSTIGES"]).default("UEBERWEISUNG"),
    paidAt: z.string().nullish(),
    notes: z.string().max(500).nullish(),
    gwgIdentifiedAt: z.string().nullish(),
    gwgIdDocument: z.string().trim().max(120).nullish(),
    gwgNotes: z.string().max(500).nullish(),
  });

  app.post("/payments", { preHandler: authGuard }, async (req, reply) => {
    const body = paymentBody.parse(req.body ?? {});
    if (!body.saleDealId && !body.purchaseDealId) {
      return reply.code(400).send({ error: "Zahlung muss einem Verkaufsvorgang oder Ankaufsvorgang zugeordnet sein." });
    }
    // GwG (Art. 20 GwG): Barzahlung ab CHF 100'000 — Identität des Zahlers
    // feststellen und dokumentieren (Meldepflicht MROS im Ausnahmefall).
    if (body.method === "BAR" && body.direction === "EINGANG" && body.amount >= GWG_CASH_THRESHOLD) {
      if (!body.gwgIdentifiedAt || !body.gwgIdDocument) {
        return reply.code(400).send({
          error: `Barzahlung ab CHF 100'000: Identitätsprüfung nötig (GwG). Bitte Datum der Identitätsfeststellung und Ausweisdokument erfassen.`,
        });
      }
    }
    const payment = await prisma.payment.create({
      data: {
        direction: body.direction,
        saleDealId: body.saleDealId ?? null,
        purchaseDealId: body.purchaseDealId ?? null,
        amount: body.amount,
        method: body.method,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        notes: body.notes ?? null,
        gwgIdentifiedAt: body.gwgIdentifiedAt ? new Date(body.gwgIdentifiedAt) : null,
        gwgIdDocument: body.gwgIdDocument ?? null,
        gwgNotes: body.gwgNotes ?? null,
      },
    });

    // Rechnung automatisch auf BEZAHLT setzen, wenn offener Betrag 0 erreicht.
    if (payment.saleDealId && body.direction === "EINGANG") {
      const invoice = await prisma.invoice.findFirst({
        where: { saleDealId: payment.saleDealId, status: { in: ["VERSANDT", "TEILZAHLUNG", "ENTWURF"] }, isCredit: false },
        orderBy: { createdAt: "desc" },
        include: { saleDeal: { include: { payments: true } } },
      });
      if (invoice) {
        const paid = invoice.saleDeal?.payments
          .filter((p) => p.direction === "EINGANG")
          .reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
        const total = Number(invoice.totalAmount ?? 0);
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: paid >= total ? "BEZAHLT" : paid > 0 ? "TEILZAHLUNG" : invoice.status },
        });
      }
    }
    await audit(req.user!.id, "PAYMENT_CREATE", "Payment", payment.id, {
      direction: body.direction,
      amount: body.amount,
      method: body.method,
      gwg: body.method === "BAR" && body.amount >= GWG_CASH_THRESHOLD,
    });
    return payment;
  });

  app.delete("/payments/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.payment.delete({ where: { id } });
    await audit(req.user!.id, "PAYMENT_DELETE", "Payment", id);
    return reply.code(204).send();
  });

  // ── Leasing-Dossier ─────────────────────────────────────────────────────

  app.post("/vehicles/:id/leasing-dossier-pdf", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const sale = await loadSaleFull(id);
    if (!sale) return reply.code(400).send({ error: "Zuerst einen Verkaufsvorgang erfassen." });
    if (sale.paymentMethod !== "LEASING") return reply.code(400).send({ error: "Verkaufsvorgang ist nicht als Leasing erfasst." });
    if (!sale.leasingPartner || sale.leasingMonthlyRate == null || !sale.leasingTermMonths) {
      return reply.code(400).send({
        error: "Für das Leasing-Dossier bitte Leasingpartner, Monatsrate und Vertragsdauer erfassen.",
      });
    }
    const c = await company();
    const partner = sale.leasingPartner!;
    const monthlyRate = Number(sale.leasingMonthlyRate);
    const termMonths = sale.leasingTermMonths!;
    const downPayment = sale.leasingDownPayment;
    const buffer = await renderPdf((doc) => {
      const b = new PdfBuilder(doc);
      b.header(c, "Leasing-Dossier", new Date());
      if (sale.buyer) b.addressBlock(debtorLines(sale.buyer));
      b.paragraph(
        `Dossier zur Leasing-Finanzierung des Fahrzeugs ${vehicleTitle(vehicle)} bei ${sale.leasingPartner}. Der Händler reicht die Unterlagen beim Leasingpartner ein; die Auszahlung erfolgt nach Vertragsunterzeichnung direkt an uns.`,
      );
      b.sectionTitle("Fahrzeug");
      b.keyValues([
        ["Fahrzeug", vehicleTitle(vehicle)],
        ["Stammnummer", vehicle.chassisNumber ?? "—"],
        ["Verkaufspreis (inkl. MWST)", sale.salePrice != null ? formatChf(Number(sale.salePrice)) : "—"],
      ]);
      b.sectionTitle("Leasing-Konditionen");
      b.keyValues([
        ["Leasingpartner", partner],
        ["Monatsrate", formatChf(monthlyRate)],
        ["Vertragsdauer", `${termMonths} Monate`],
        ...(downPayment != null ? ([["Anzahlung", formatChf(Number(downPayment))]] as [string, string][]) : []),
        ["Totalkosten der Laufzeit", formatChf(monthlyRate * termMonths + Number(downPayment ?? 0))],
      ]);
      b.sectionTitle("Ablauf");
      b.bulletList([
        "Kaufvertrag unterschreiben (Käufer, Händler).",
        "Leasingantrag mit Fahrzeugdaten und Kaufvertrag beim Leasingpartner einreichen.",
        "Nach Bonitätsfreigabe: Leasingvertrag durch den Leasingpartner und den Käufer unterschreiben.",
        "Auszahlung des Verkaufspreises an uns (Kaufpreis financing: method LEASING); das Fahrzeug wird bei der Leasinggesellschaft als Halterin/Halter eingetragen.",
        "Kontrollscheine: Halterwechsel am Strassenverkehrsamt mit Eintragung des Leasingnehmers als Halter.",
      ]);
      b.footerNote("Erstellt automatisch mit MyLittleCarDealership. Standarddossier — keine Rechtsberatung.");
    });
    const document = await saveVehicleDocument(id, "LEASING_DOSSIER", `Leasing-Dossier ${vehicleTitle(vehicle)}`, buffer);
    await audit(req.user!.id, "PDF_LEASING_DOSSIER", "Vehicle", id, { documentId: document.id });
    return document;
  });

  // ── Zusammenfassungs-PDF (Archiv 10 Jahre) ──────────────────────────────

  app.post("/vehicles/:id/zusammenfassung-pdf", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        purchase: { include: { seller: { select: { type: true, firstName: true, lastName: true, companyName: true, street: true, zip: true, city: true } }, valuationItems: true } },
        sale: { include: { buyer: true, addons: true, payments: true, invoices: true } },
        workOrders: { include: { provider: { select: { name: true } } } },
      },
    });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const c = await company();
    const purchase = vehicle.purchase;
    const sale = vehicle.sale;
    const istCosts = vehicle.workOrders.reduce((sum, w) => sum + Number(w.costActual ?? w.costEstimate ?? 0), 0);
    const purchasePrice = purchase?.purchasePrice != null ? Number(purchase.purchasePrice) : null;
    const salePrice = sale?.salePrice != null ? Number(sale.salePrice) : null;
    const margin = salePrice != null && purchasePrice != null ? round2(salePrice - purchasePrice - istCosts) : null;

    const buffer = await renderPdf((doc) => {
      const b = new PdfBuilder(doc);
      b.header(c, "Verkaufszusammenfassung (Archiv)", new Date());
      b.paragraph(
        `Zusammenfassung des gesamten Ablaufs von Ankauf bis Verkauf — Basis für das Offline-Archiv (Aufbewahrung 10 Jahre gem. Obligationenrecht/GeWG).`,
      );
      b.sectionTitle("Fahrzeug");
      b.keyValues([
        ["Fahrzeug", vehicleTitle(vehicle)],
        ["Stammnummer", vehicle.chassisNumber ?? "—"],
        ["Status", vehicle.status],
        ["Im Bestand seit", vehicle.createdAt ? formatDateDe(vehicle.createdAt) : "—"],
      ]);

      b.sectionTitle("1. Ankauf");
      if (purchase) {
        b.keyValues([
          ["Verkäufer/in", purchase.seller ? contactDisplayName(purchase.seller) : "—"],
          ["Kanal", purchase.channel],
          ["Ankaufdatum", purchase.purchasedAt ? formatDateDe(purchase.purchasedAt) : "—"],
          ["Ankaufspreis", purchasePrice != null ? formatChf(purchasePrice) : "—"],
          ["Zahlungsart", PAYMENT_METHOD_LABELS[purchase.paymentMethod] ?? purchase.paymentMethod],
        ]);
        if (purchase.valuationItems.length) {
          b.bulletList(purchase.valuationItems.map((v) => `${v.description}: ${formatChf(Number(v.amount))} (erwartet)`));
        }
      } else {
        b.paragraph("Kein Ankaufsvorgang erfasst.");
      }

      b.sectionTitle("2. Aufbereitung");
      if (vehicle.workOrders.length) {
        b.bulletList(
          vehicle.workOrders.map((w) => {
            const provider = w.providerName ?? w.provider?.name ?? w.providerType;
            return `${w.description} (${w.type}, ${provider}, ${w.status}): Soll ${w.costEstimate != null ? formatChf(Number(w.costEstimate)) : "—"}, Ist ${w.costActual != null ? formatChf(Number(w.costActual)) : "—"}`;
          }),
        );
        b.keyValues([["Total Aufbereitung (Ist)", formatChf(istCosts)]]);
      } else {
        b.paragraph("Keine Aufträge erfasst.");
      }

      b.sectionTitle("3. Verkauf");
      if (sale) {
        b.keyValues([
          ["Käufer/in", sale.buyer ? contactDisplayName(sale.buyer) : "—"],
          ["Verkaufsdatum", sale.soldAt ? formatDateDe(sale.soldAt) : "—"],
          ["Verkaufspreis", salePrice != null ? formatChf(salePrice) : "—"],
          ["Zahlungsart", PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod],
          ...(sale.paymentMethod === "LEASING" && sale.leasingPartner ? ([["Leasingpartner", sale.leasingPartner]] as [string, string][]) : []),
          ...(sale.tradeInCredit ? ([["Eintausch-Verrechnung", `− ${formatChf(Number(sale.tradeInCredit))} (${sale.tradeInDescription ?? ""})`]] as [string, string][]) : []),
        ]);
        if (sale.addons.length) {
          b.bulletList(sale.addons.map((a) => `${a.name}: ${a.price != null ? formatChf(Number(a.price)) : "—"}${a.provider ? ` (${a.provider})` : ""}`));
        }
        if (sale.invoices.length) {
          b.sectionTitle("Rechnungen");
          b.bulletList(
            sale.invoices.map(
              (inv) =>
                `${inv.isCredit ? "Gutschrift" : "Rechnung"} ${inv.number} — ${inv.totalAmount != null ? formatChf(Number(inv.totalAmount)) : "—"} (${inv.status}${inv.reminderLevel ? `, Mahnstufe ${inv.reminderLevel}` : ""})`,
            ),
          );
        }
      } else {
        b.paragraph("Kein Verkaufsvorgang erfasst.");
      }

      b.sectionTitle("4. Zahlungen");
      if (sale?.payments.length || purchase) {
        const rows: [string, string][] = [
          ...(sale?.payments ?? []).map(
            (p) =>
              [
                `${p.paidAt ? formatDateDe(p.paidAt) : "—"} · ${PAYMENT_METHOD_LABELS[p.method ?? ""] ?? p.method ?? "—"}${p.gwgIdentifiedAt ? " (GwG identifiziert)" : ""}`,
                `${p.direction === "EINGANG" ? "+" : "−"} ${formatChf(Number(p.amount))}`,
              ] as [string, string],
          ),
          ...(purchase && purchase.paymentMethod !== "EINTAUSCH"
            ? ([["Auszahlung an Verkäufer/in (geplant)", purchasePrice != null ? `− ${formatChf(purchasePrice)}` : "—"]] as [string, string][])
            : []),
        ];
        if (rows.length) b.keyValues(rows);
      } else {
        b.paragraph("Keine Zahlungen erfasst.");
      }

      b.sectionTitle("5. Ergebnis");
      b.keyValues([
        ["Ankaufspreis", purchasePrice != null ? formatChf(purchasePrice) : "—"],
        ["Aufbereitung (Ist)", formatChf(istCosts)],
        ["Verkaufspreis", salePrice != null ? formatChf(salePrice) : "—"],
        ...(margin != null ? ([["Deckungsbeitrag", formatChf(margin)]] as [string, string][]) : []),
      ]);
      b.footerNote("Archivdokument — Aufbewahrung 10 Jahre. Erstellt automatisch mit MyLittleCarDealership.");
    });
    const document = await saveVehicleDocument(id, "ZUSAMMENFASSUNG", `Zusammenfassung ${vehicleTitle(vehicle)}`, buffer);
    await audit(req.user!.id, "PDF_ZUSAMMENFASSUNG", "Vehicle", id, { documentId: document.id });
    return document;
  });

  // ── Auswertungen (Deckungsbeitrag, Bestandswert, Umsatz) ────────────────

  app.get("/reports", { preHandler: authGuard }, async (req) => {
    const q = z
      .object({ year: z.coerce.number().int().min(2000).max(2100).optional() })
      .parse(req.query ?? {});
    const year = q.year ?? new Date().getFullYear();

    const vehicles = await prisma.vehicle.findMany({
      where: { status: { in: ["GEKAUFT", "AUFBEREITUNG", "VERKAUF", "VERKAUFT", "ABGESCHLOSSEN"] } },
      include: {
        purchase: { select: { purchasePrice: true, purchasedAt: true } },
        sale: { select: { salePrice: true, soldAt: true, status: true } },
        workOrders: { select: { costActual: true, costEstimate: true, status: true } },
      },
    });

    let bestandswert = 0;
    let umsatz = 0;
    const deckungsbeitrag: {
      vehicleId: string;
      vehicleTitle: string;
      purchasePrice: number | null;
      prepCosts: number;
      salePrice: number | null;
      margin: number | null;
      soldAt: string | null;
    }[] = [];

    for (const v of vehicles) {
      const istCosts = v.workOrders.reduce((sum, w) => sum + Number(w.costActual ?? 0), 0);
      const purchasePrice = v.purchase?.purchasePrice != null ? Number(v.purchase.purchasePrice) : null;
      const salePrice = v.sale?.salePrice != null ? Number(v.sale.salePrice) : null;
      if (["GEKAUFT", "AUFBEREITUNG", "VERKAUF"].includes(v.status)) {
        bestandswert += (purchasePrice ?? 0) + istCosts;
      }
      const soldAt = v.sale?.soldAt;
      if (soldAt && soldAt.getFullYear() === year && salePrice != null) {
        umsatz += salePrice;
      }
      if (v.sale?.soldAt || v.status === "ABGESCHLOSSEN") {
        deckungsbeitrag.push({
          vehicleId: v.id,
          vehicleTitle: vehicleTitle(v),
          purchasePrice,
          prepCosts: istCosts,
          salePrice,
          margin: salePrice != null && purchasePrice != null ? round2(salePrice - purchasePrice - istCosts) : null,
          soldAt: v.sale?.soldAt?.toISOString() ?? null,
        });
      }
    }
    return { year, bestandswert: round2(bestandswert), umsatz: round2(umsatz), deckungsbeitrag };
  });

  // ── Buchhaltungsexport CSV ──────────────────────────────────────────────

  app.get("/reports/buchhaltung.csv", { preHandler: authGuard }, async (_req, reply) => {
    const vehicles = await prisma.vehicle.findMany({
      where: { status: { in: ["VERKAUFT", "ABGESCHLOSSEN", "GEKAUFT", "AUFBEREITUNG", "VERKAUF"] } },
      include: {
        purchase: { include: { valuationItems: true, seller: { select: { type: true, firstName: true, lastName: true, companyName: true } } } },
        sale: { include: { buyer: { select: { type: true, firstName: true, lastName: true, companyName: true } }, invoices: true, payments: true, addons: true } },
        workOrders: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const esc = (v: unknown): string => {
      const s = v == null ? "" : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (v: unknown): string => (v == null ? "" : String(Math.round(Number(v) * 100) / 100));
    const iso = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "");

    const lines: string[] = [
      // Excel-freundlich: Semikolon, Dezimalpunkt, BOM wird beim Senden gesetzt.
      "CHID;Marke;Modell;Typ;Ankaufdatum;Ankaufspreis;Verkaeufer;AufbereitungSoll;AufbereitungIst;Verkaufsdatum;Verkaufspreis;Kaeufer;RechnungsNr;RechnungStatus;RechnungTotal;MWST;Deckungsbeitrag;ZahlungenEingang",
    ];
    for (const v of vehicles) {
      const purchasePrice = v.purchase?.purchasePrice != null ? Number(v.purchase.purchasePrice) : null;
      const istCosts = v.workOrders.reduce((sum, w) => sum + Number(w.costActual ?? 0), 0);
      const sollCosts = v.workOrders.reduce((sum, w) => sum + Number(w.costEstimate ?? 0), 0);
      const salePrice = v.sale?.salePrice != null ? Number(v.sale.salePrice) : null;
      const margin = salePrice != null && purchasePrice != null ? round2(salePrice - purchasePrice - istCosts) : null;
      const paid = (v.sale?.payments ?? [])
        .filter((p) => p.direction === "EINGANG")
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const invoice = v.sale?.invoices.find((i) => !i.isCredit) ?? v.sale?.invoices[0];
      const vat = invoice?.vatAmount != null ? Number(invoice.vatAmount) : salePrice != null ? round2(salePrice * 0.081 / 1.081) : null;
      lines.push(
        [
          v.chassisNumber ?? "",
          v.make,
          v.model,
          v.variant ?? "",
          iso(v.purchase?.purchasedAt),
          num(purchasePrice),
          v.purchase?.seller ? contactDisplayName(v.purchase.seller) : "",
          num(sollCosts),
          num(istCosts),
          iso(v.sale?.soldAt),
          num(salePrice),
          v.sale?.buyer ? contactDisplayName(v.sale.buyer) : "",
          invoice?.number ?? "",
          invoice?.status ?? "",
          invoice?.totalAmount != null ? num(invoice.totalAmount) : "",
          vat != null ? num(vat) : "",
          margin != null ? num(margin) : "",
          num(paid),
        ].join(";"),
      );
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="buchhaltung-${new Date().toISOString().slice(0, 10)}.csv"`);
    return "\uFEFF" + lines.join("\n");
  });
}
