import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard } from "../plugins/auth.js";
import { PdfBuilder, formatDateDe, formatChf, renderPdf, type PdfCompany } from "../lib/pdf.js";
import { DOCUMENTS_DIR, isSafeFilename, mimeForFilename, saveGeneratedFile } from "../lib/uploads.js";
import { contactDisplayName } from "./contacts.routes.js";

// Server-generierte Dokumente: Ankaufsangebot und Ankaufsvertrag (Phase B),
// später Kaufvertrag, Rechnung, A3-Tafel und Verkaufszusammenfassung.
// Alle PDFs sind privat und laufen ausschliesslich über die authentifizierte
// Download-Route. Die Textbausteine sind Standardvorlagen — keine
// Rechtsberatung; individuelle Klauseln pflegt der Händler in den
// Einstellungen (Gewährleistungstext).

const PAYMENT_LABELS: Record<string, string> = {
  BAR: "Barzahlung bei Fahrzeugübergabe",
  UEBERWEISUNG: "Banküberweisung",
  EINTAUSCH: "Eintausch / Verrechnung",
};

async function company(): Promise<PdfCompany> {
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
  };
}

function vehicleTitle(v: { make: string; model: string; variant: string | null }): string {
  return `${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ""}`;
}

function vehicleRows(v: {
  make: string;
  model: string;
  variant: string | null;
  chassisNumber: string | null;
  firstRegistration: Date | null;
  mileageKm: number | null;
  color: string | null;
  mfkUntil: Date | null;
  plates: string | null;
}): [string, string][] {
  return [
    ["Marke / Modell / Typ", vehicleTitle(v)],
    ["Stammnummer (CHID)", v.chassisNumber ?? "—"],
    ["Erste Inverkehrtsetzung", v.firstRegistration ? formatDateDe(v.firstRegistration) : "—"],
    ["Kilometerstand", v.mileageKm != null ? `${v.mileageKm.toLocaleString("de-CH")} km` : "—"],
    ["Farbe", v.color ?? "—"],
    ["Letzte MFK", v.mfkUntil ? formatDateDe(v.mfkUntil) : "—"],
    ...(v.plates ? ([["Kennzeichen", v.plates]] as [string, string][]) : []),
  ];
}

function sellerAddressLines(seller: {
  type: "PRIVAT" | "FIRMA";
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
}): string[] {
  return [
    contactDisplayName(seller),
    seller.type === "FIRMA" && seller.companyName && contactDisplayName(seller) !== seller.companyName ? seller.companyName : "",
    seller.street ?? "",
    [seller.zip, seller.city].filter(Boolean).join(" "),
  ].filter(Boolean);
}

async function saveDocument(
  vehicleId: string,
  documentType: "ANKAUF_ANGEBOT" | "ANKAUF_VERTRAG" | "TAFAEL",
  title: string,
  buffer: Buffer,
) {
  const filename = await saveGeneratedFile(DOCUMENTS_DIR, buffer);
  return prisma.generatedDocument.create({
    data: { vehicleId, documentType, title, filePath: filename },
  });
}

async function loadDeal(id: string) {
  return prisma.purchaseDeal.findUnique({
    where: { id },
    include: {
      vehicle: true,
      seller: { select: { type: true, firstName: true, lastName: true, companyName: true, street: true, zip: true, city: true } },
    },
  });
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  // ── Ankaufsangebot (nur der Ankaufspreis; keine Kosten, kein Gewinn) ─────

  app.post("/purchases/:id/offer-pdf", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const deal = await loadDeal(id);
    if (!deal) return reply.code(404).send({ error: "Ankaufsvorgang nicht gefunden" });
    if (deal.paymentMethod === "EINTAUSCH") {
      return reply.code(400).send({
        error:
          "Bei Eintausch wird kein separates Ankaufsangebot erstellt — die Verrechnung erfolgt im Kaufvertrag des Verkaufsfahrzeugs.",
      });
    }
    if (deal.purchasePrice == null) {
      return reply.code(400).send({ error: "Zuerst einen Ankaufspreis erfassen, dann das Angebot erstellen." });
    }
    const c = await company();
    const now = new Date();
    const buffer = await renderPdf((doc) => {
      const b = new PdfBuilder(doc);
      b.header(c, "Ankaufsangebot", now);
      b.addressBlock(deal.seller ? sellerAddressLines(deal.seller) : ["Verkäufer/in (Adresse nachtragen)"]);
      b.paragraph(
        `Besten Dank, dass Sie Ihr ${vehicleTitle(deal.vehicle)} bei uns anbieten. Nach Besichtigung und Prüfung unterbreiten wir Ihnen hiermit unser Angebot für einen freihändigen Ankauf:`,
      );
      b.sectionTitle("Fahrzeug");
      b.keyValues(vehicleRows(deal.vehicle));
      b.sectionTitle("Unser Angebot");
      b.highlightBox(
        formatChf(Number(deal.purchasePrice)),
        `Ankaufspreis · gültig 14 Tage ab ${formatDateDe(now)}`,
      );
      b.sectionTitle("Ablauf und Konditionen");
      b.bulletList([
        "Übernahme des Fahrzeugs nach Terminabsprache bei uns im Betrieb.",
        "Bei der Übergabe erhalten wir den Fahrzeugausweis, das Serviceheft (falls vorhanden) sowie sämtliche Schlüssel.",
        `Auszahlung des Ankaufspreises per ${PAYMENT_LABELS[deal.paymentMethod] ?? deal.paymentMethod}${
          deal.paymentDueDate ? ` bis spätestens ${formatDateDe(deal.paymentDueDate)}` : ""
        }.`,
        "Die Fahrzeugübertragung wird am Strassenverkehrsamt abgemeldet; die Gebühr übernimmt der Käufer.",
        "Sie bestätigen mit Ihrer Unterschrift, dass Sie berechtigt sind, das Fahrzeug zu veräussern, und dass es frei von Rechten Dritter ist.",
      ]);
      b.signatures("Verkäufer/in", c.companyName);
      b.footerNote("Erstellt automatisch mit MyLittleCarDealership. Dieses Dokument ist eine Standardvorlage.");
    });
    const document = await saveDocument(deal.vehicleId, "ANKAUF_ANGEBOT", `Ankaufsangebot ${vehicleTitle(deal.vehicle)}`, buffer);
    await audit(req.user!.id, "GENERATE", "GeneratedDocument", document.id, { type: "ANKAUF_ANGEBOT", dealId: id });
    return reply.code(201).send(document);
  });

  // ── Ankaufsvertrag (erfüllt die MWST-Belegpflichten nach Art. 38 MWSTG: ──
  //    Typ, Stammnummer, Datum, Name/Adresse des Verkäufers) ───────────────

  app.post("/purchases/:id/contract-pdf", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const deal = await loadDeal(id);
    if (!deal) return reply.code(404).send({ error: "Ankaufsvorgang nicht gefunden" });
    if (deal.purchasePrice == null) {
      return reply.code(400).send({ error: "Zuerst einen Ankaufspreis erfassen, dann den Vertrag erstellen." });
    }
    const c = await company();
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    const now = new Date();
    const handoverDate = deal.purchasedAt ?? now;
    const isTradeIn = deal.paymentMethod === "EINTAUSCH";
    const buffer = await renderPdf((doc) => {
      const b = new PdfBuilder(doc);
      b.header(c, isTradeIn ? "Übernahmebestätigung Eintausch (Ankauf)" : "Ankaufsvertrag", now);

      b.sectionTitle("Vertragsparteien");
      b.keyValues([
        ["Verkäufer/in", contactDisplayName(deal.seller ?? { type: "PRIVAT", firstName: null, lastName: null, companyName: null })],
        ...(deal.seller ? ([["Adresse", sellerAddressLines(deal.seller).slice(1).join(", ") || "—"]] as [string, string][]) : []),
        ["Käufer", c.companyName],
        ["Adresse Käufer", [c.addressLine, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
      ]);

      b.sectionTitle("§ 1 Vertragsgegenstand");
      b.keyValues(vehicleRows(deal.vehicle));
      b.paragraph(
        "Der Verkäufer ist Eigentümerin bzw. Eigentümer des Fahrzeugs, ist zur Veräusserung berechtigt und bestätigt, dass das Fahrzeug frei von Rechten Dritter ist.",
      );

      b.sectionTitle("§ 2 Kaufpreis und Zahlung");
      b.keyValues([
        ["Kaufpreis", formatChf(Number(deal.purchasePrice))],
        ["Zahlungsart", PAYMENT_LABELS[deal.paymentMethod] ?? deal.paymentMethod],
        ...(deal.paymentDueDate ? ([["Auszahlung bis", formatDateDe(deal.paymentDueDate)]] as [string, string][]) : []),
      ]);
      if (isTradeIn) {
        b.paragraph(
          "Das Fahrzeug wird im Eintausch gegen den Neukauf eines Fahrzeugs übernommen. Der Einkaufspreis ist auf der Verkaufsrechnung als Abzugsposten ausgewiesen; massgebend ist der vereinbarte Marktwert.",
        );
      }

      b.sectionTitle("§ 3 Übergabe");
      b.paragraph(
        `Die Übergabe erfolgt am ${formatDateDe(handoverDate)} bei ${
          [c.zip, c.city].filter(Boolean).join(" ") || c.companyName
        }. Bei der Übergabe händigt der Verkäufer aus: den Fahrzeugausweis, das Serviceheft (falls vorhanden), sämtliche Fahrzeugschlüssel sowie die Kontrollscheibe. Mit der Übergabe gehen Nutzen und Gefahr auf den Käufer über. Die Abmeldung beim Strassenverkehrsamt veranlasst der Käufer.`,
      );

      b.sectionTitle("§ 4 Zustand und Gewährleistung");
      const warrantyText = setting?.warrantyText?.trim();
      b.paragraph(
        warrantyText ||
          "Das Fahrzeug wird im besichtigten und geprüften Zustand übernommen («wie besichtigt»). Gewährleistungsansprüche des Käufers gegenüber dem Verkäufer sind soweit gesetzlich zulässig wegbedungen. Der Verkäufer bestätigt die Richtigkeit der Angaben zum Fahrzeug und die Vollständigkeit der ihm bekannten Mängel; ihm bekannte wesentliche Mängel sind im Übergabeprotokoll festgehalten.",
      );

      b.sectionTitle("§ 5 Schlusserklärung");
      b.paragraph("Dieser Vertrag wird in zwei gleichlautenden Ausführungen unterzeichnet; jede Partei erhält eine Ausfertigung.");

      b.signatures("Verkäufer/in", `Käufer: ${c.companyName}`);
      b.footerNote("Erstellt automatisch mit MyLittleCarDealership. Standardvorlage — keine Rechtsberatung.");
    });
    const document = await saveDocument(
      deal.vehicleId,
      "ANKAUF_VERTRAG",
      isTradeIn ? `Übernahmebestätigung ${vehicleTitle(deal.vehicle)}` : `Ankaufsvertrag ${vehicleTitle(deal.vehicle)}`,
      buffer,
    );
    await audit(req.user!.id, "GENERATE", "GeneratedDocument", document.id, { type: "ANKAUF_VERTRAG", dealId: id });
    return reply.code(201).send(document);
  });

  // ── A3-Quer-Tafel für die Windschutzscheibe (immer gleiches Schema:
  //    Logo/Firma, Preis, Fahrzeugdaten, Beschreibung, Ausstattung, QR) ─────

  app.post("/vehicles/:id/board-pdf", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const vehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) return reply.code(404).send({ error: "Fahrzeug nicht gefunden" });
    const { price } = z
      .object({
        price: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().min(0).nullable().optional()),
      })
      .parse(req.body ?? {});
    const displayPrice = price ?? (vehicle.targetSalePrice != null ? Number(vehicle.targetSalePrice) : null);
    const c = await company();
    const qrPng = vehicle.as24Url
      ? await QRCode.toBuffer(vehicle.as24Url, { width: 512, margin: 1 })
      : null;

    const W = 1191; // A3 quer
    const H = 842;
    const M = 70;
    const priceText = displayPrice != null ? formatChf(displayPrice) : "Preis auf Anfrage";
    const facts = [
      vehicle.firstRegistration ? `EZ ${new Intl.DateTimeFormat("de-CH", { month: "2-digit", year: "numeric" }).format(vehicle.firstRegistration)}` : null,
      vehicle.mileageKm != null ? `${vehicle.mileageKm.toLocaleString("de-CH")} km` : null,
      vehicle.fuel,
      vehicle.transmission,
      vehicle.color,
      vehicle.mfkUntil ? `MFK bis ${formatDateDe(vehicle.mfkUntil)}` : null,
    ].filter(Boolean) as string[];

    const buffer = await renderPdf(
      (doc) => {
        // Kopf: Firmenname als Logo-Platzhalter (echtes Logo kommt mit Phase G/E).
        doc.font("Helvetica-Bold").fontSize(20).fillColor("#111827").text(c.companyName, M, M);
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor("#6b7280")
          .text([c.addressLine, [c.zip, c.city].filter(Boolean).join(" "), c.phone, c.website].filter(Boolean).join("  ·  "), M, M + 26);

        // Preisbox rechts oben (Markenzeichen der Tafel).
        doc.roundedRect(W - M - 310, M - 10, 310, 64, 10).fill("#f59e0b");
        doc.font("Helvetica-Bold").fontSize(24).fillColor("#111827").text(priceText, W - M - 290, M + 8);

        // Fahrzeugtitel gross.
        doc.font("Helvetica-Bold").fontSize(32).fillColor("#111827").text(vehicleTitle(vehicle), M, M + 100, { width: W - 2 * M - 340 });

        // Faktenzeile.
        doc.font("Helvetica").fontSize(14).fillColor("#374151").text(facts.join("   ·   "), M, M + 158);

        // Beschreibung (gekürzt auf den Tafel-Platz).
        if (vehicle.description) {
          doc.font("Helvetica").fontSize(12).fillColor("#374151").text(vehicle.description, M, M + 200, {
            width: W - 2 * M - 380,
            height: 210,
            ellipsis: true,
            lineGap: 3,
          });
        }

        // Sonderausstattungen, zwei Spalten, fette Überschrift.
        const equip = vehicle.equipment ?? [];
        if (equip.length) {
          const startY = M + 430;
          doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827").text("Ausstattung", M, startY);
          doc.font("Helvetica").fontSize(12).fillColor("#374151");
          equip.slice(0, 20).forEach((item, index) => {
            const col = index % 2;
            const row = Math.floor(index / 2);
            // WinAnsi kennt kein ✓ — sauberer Bullet für Standard-Fonts.
            doc.text(`•  ${item}`, M + col * 380, startY + 24 + row * 20);
          });
        }

        // QR-Code unten rechts: direkt zum AutoScout24-Inserat.
        if (qrPng) {
          doc.image(qrPng, W - M - 150, H - M - 190, { width: 150 });
          doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text(
            "Alle Infos & Fotos:\nQR-Code scannen",
            W - M - 175,
            H - M - 32,
            { width: 200, align: "center" },
          );
        }

        doc.font("Helvetica").fontSize(9).fillColor("#9ca3af").text(
          `${c.companyName} · ${[c.zip, c.city].filter(Boolean).join(" ")}${c.phone ? ` · ${c.phone}` : ""}`,
          M,
          H - M - 14,
        );
      },
      { size: "A3", layout: "landscape" },
    );

    const document = await saveDocument(vehicle.id, "TAFAEL", `A3-Tafel ${vehicleTitle(vehicle)}`, buffer);
    await audit(req.user!.id, "GENERATE", "GeneratedDocument", document.id, { type: "TAFAEL", vehicleId: id });
    return reply.code(201).send(document);
  });

  // ── Download generierter Dokumente (privat, authentifiziert) ─────────────

  app.get("/documents/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const document = await prisma.generatedDocument.findUnique({ where: { id } });
    if (!document) return reply.code(404).send({ error: "Dokument nicht gefunden" });
    const full = path.join(DOCUMENTS_DIR, document.filePath);
    if (!isSafeFilename(document.filePath) || !(await stat(full).then((s) => s.isFile()).catch(() => false))) {
      return reply.code(404).send({ error: "Datei nicht gefunden" });
    }
    reply.header("Content-Type", mimeForFilename(document.filePath) ?? "application/pdf");
    const safeTitle = document.title.replace(/[^\w. -]/g, "").trim() || "dokument";
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${safeTitle}.pdf`)}`);
    return reply.send(createReadStream(full));
  });
}
