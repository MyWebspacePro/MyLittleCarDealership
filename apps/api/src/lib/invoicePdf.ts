import { SwissQRBill } from "swissqrbill/pdf";
import type { Data as QrBillData } from "swissqrbill/types";
import { PdfBuilder, formatDateDe, formatChf, renderPdf, type PdfCompany } from "./pdf.js";
import { formatQrReference } from "./qrr.js";

// Schweizer Rechnungs-PDF: Briefkopf + Positionen (MWST im Bruttopreis
// ausgewiesen, Art. 38 MWSTG-Belegpflichten) + QR-Rechnungsteil (105 mm
// unten auf der A4-Seite oder auf eigener Seite, wenn der Text zu lang ist).

export const A4_HEIGHT = 841.89;
const MARGIN = 56;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** CHF mit zwingend 2 Dezimalen (Rechnungswesen). */
function chf2(value: number): string {
  return `${new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} CHF`;
}

/** Höhe des QR-Rechnungsteils: 105 mm = 297.64 pt. */
const QR_PART_HEIGHT = 297.64;
/** Rechnungstext endet hier spätestens, sonst kommt der QR-Teil auf eine eigene Seite. */
const QR_TOP = A4_HEIGHT - QR_PART_HEIGHT;

export interface InvoicePosition {
  description: string;
  amount: number;
}

export interface InvoiceRenderInput {
  company: PdfCompany & { iban: string; qrIban: string };
  invoiceNumber: string;
  qrReference: string | null;
  issuedAt: Date;
  dueAt: Date | null;
  /** Empfänger-Zeilen (Name/Firma, Strasse, PLZ Ort). */
  debtorLines: string[];
  subject: string;
  positions: InvoicePosition[];
  /** Nicht MWST-pflichtige Abgaben, separat ausgewiesen (z. B. Kontrollscheine). */
  fees: { description: string; amount: number }[];
  /** Abzugsposten (Eintausch) — vermindert den MWST-pflichtigen Betrag. */
  deductions: { description: string; amount: number }[];
  vatRate: number;
  /** Bruttoposten inkl. MWST (Subtotal nach Abzügen). */
  subtotalGross: number;
  vatAmount: number;
  netAmount: number;
  feesTotal: number;
  total: number;
  notes?: string[];
  /** Mahnwesen: Kennzeichnung, offener Betrag und Frist. */
  reminder?: {
    label: string;
    openAmount: number;
    fristDays: number;
    legalNote?: boolean;
    originalNumber: string;
    originalDate: Date;
  };
}

/** Positionstabelle mit Kopfzeile und rechter Spalte (Rechtsbündigkeit). */
function positionsTable(b: PdfBuilder, rows: { label: string; right: string; bold?: boolean; muted?: boolean }[]): void {
  const doc = b.doc;
  const labelX = MARGIN;
  const rightX = PAGE_WIDTH - MARGIN - 120;
  doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Position", labelX, doc.y);
  doc.text("Betrag", rightX, doc.y, { width: 120, align: "right" });
  doc.x = MARGIN;
  doc.moveDown(0.4);
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).lineWidth(0.75).strokeColor("#d1d5db").stroke();
  doc.moveDown(0.4);
  for (const row of rows) {
    const y = doc.y;
    doc
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.bold ? 11 : 10)
      .fillColor(row.muted ? "#6b7280" : "#374151")
      .text(row.label, labelX, y, { width: CONTENT_WIDTH - 130, lineGap: 2 });
    doc
      .font(row.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.bold ? 11 : 10)
      .fillColor(row.bold ? "#111827" : row.muted ? "#6b7280" : "#374151")
      .text(row.right, rightX, y, { width: 120, align: "right" });
    doc.x = MARGIN;
    doc.y = Math.max(doc.y, y + doc.currentLineHeight());
    doc.moveDown(0.5);
  }
  doc.moveDown(0.3);
}

function attachQrPart(doc: PDFKit.PDFDocument, data: QrBillData): void {
  const bill = new SwissQRBill(data, { language: "DE" });
  if (doc.y > QR_TOP && doc.y > MARGIN + 100) {
    doc.addPage();
  }
  bill.attachTo(doc, 0, QR_TOP);
  doc.x = MARGIN;
  doc.y = QR_TOP;
}

function qrBillData(input: InvoiceRenderInput, amount: number): QrBillData | null {
  const c = input.company;
  if (!c.qrIban) return null;
  const [debtorName, ...debtorRest] = input.debtorLines;
  const zip = debtorRest.at(-1)?.split(/\s+/)[0];
  const city = debtorRest.at(-1)?.split(/\s+/).slice(1).join(" ");
  return {
    creditor: {
      account: c.qrIban,
      name: c.companyName,
      address: c.addressLine || "-",
      zip: c.zip || "-",
      city: c.city || "-",
      country: "CH",
    },
    debtor: debtorName && zip && city ? { name: debtorName, address: debtorRest.slice(0, -1).join(" ") || "-", zip, city, country: "CH" } : undefined,
    currency: "CHF",
    amount: Math.round(amount * 100) / 100,
    reference: input.qrReference ?? undefined,
    message: `Rechnung ${input.invoiceNumber}`.slice(0, 140),
  };
}

/** Rechnung (oder Mahnung) als PDF-Buffer rendern. */
export function renderInvoicePdf(input: InvoiceRenderInput, opts: { withQr: boolean }): Promise<Buffer> {
  return renderPdf((doc) => {
    const b = new PdfBuilder(doc);
    const isReminder = Boolean(input.reminder);
    b.header(
      input.company,
      isReminder ? input.reminder!.label : `Rechnung ${input.invoiceNumber}`,
      input.issuedAt,
    );
    b.addressBlock(input.debtorLines);

    if (isReminder) {
      b.paragraph(
        input.reminder!.label +
          ` zu Rechnung ${input.reminder!.originalNumber} vom ${formatDateDe(input.reminder!.originalDate)}. Trotz der Frist ist der offene Betrag bislang nicht eingegangen.`,
      );
    } else {
      b.paragraph(input.subject);
    }

    // Meta-Zeile
    if (isReminder) {
      b.keyValues([
        ["Datum", formatDateDe(input.issuedAt)],
        ["Frist bis", formatDateDe(new Date(input.issuedAt.getTime() + input.reminder!.fristDays * 86_400_000))],
      ]);
    } else {
      b.keyValues([
        ["Rechnungsdatum", formatDateDe(input.issuedAt)],
        ["Fällig am", input.dueAt ? formatDateDe(input.dueAt) : "—"],
      ]);
    }

    const rows: { label: string; right: string; bold?: boolean; muted?: boolean }[] = input.positions.map((p) => ({
      label: p.description,
      right: chf2(p.amount),
    }));
    for (const d of input.deductions) {
      rows.push({ label: d.description, right: `- ${chf2(d.amount)}`, muted: true });
    }
    rows.push({ label: "Subtotal inkl. MWST", right: chf2(input.subtotalGross), bold: false });
    rows.push({ label: `davon MWST ${input.vatRate.toFixed(1).replace(".", ",")} % (im Betrag enthalten)`, right: chf2(input.vatAmount), muted: true });
    rows.push({ label: "davon netto", right: chf2(input.netAmount), muted: true });
    for (const f of input.fees) {
      rows.push({ label: `${f.description} (MWST-frei, separat)`, right: chf2(f.amount), muted: true });
    }
    rows.push({ label: "Total", right: chf2(input.total), bold: true });
    positionsTable(b, rows);

    if (input.reminder) {
      b.highlightBox(
        `Offener Betrag: ${chf2(input.reminder.openAmount)}`,
        `Bitte bezahlen Sie den offenen Betrag bis ${formatDateDe(new Date(input.issuedAt.getTime() + input.reminder.fristDays * 86_400_000))}.`,
      );
      if (input.reminder.legalNote) {
        b.paragraph(
          "Nach erfolgloser Frist setzen wir das Rechtsbeizugsverfahren in Gang; die hierfür anfallenden Kosten werden belastet (Art. 104 OR: Verzugszins 5 %).",
        );
      }
    }

    if (input.notes?.length) {
      b.sectionTitle("Bemerkungen");
      b.bulletList(input.notes);
    }

    if (input.company.iban && !opts.withQr) {
      b.sectionTitle("Zahlungsinformationen");
      b.keyValues([["IBAN", input.company.iban], ["Verwendungszweck", `Rechnung ${input.invoiceNumber}`]]);
    }

    const qrAmount = input.reminder ? input.reminder.openAmount : input.total;
    if (opts.withQr) {
      const data = qrBillData(input, qrAmount);
      if (data) {
        attachQrPart(doc, data);
        return;
      }
      b.footerNote(
        "QR-Rechnung: Es ist noch kein QR-IBAN in den Stammdaten hinterlegt. Sobald der QR-IBAN (bei der Bank beantragen) erfasst ist, erscheint hier der Zahlteil mit QR-Code.",
      );
    }
    b.footerNote(`MWST-Nr. ${input.company.vatNumber} · Erstellt automatisch mit MyLittleCarDealership.`);
  });
}

/** QRR formatiert mit Leerzeichen (Anzeige). */
export function displayQr(reference: string): string {
  return formatQrReference(reference);
}
