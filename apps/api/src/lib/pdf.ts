import PDFDocument from "pdfkit";

// Baukasten für die Server-PDFs (Ankaufsangebot, Ankaufsvertrag, später
// Kaufvertrag/Rechnung/Tafel). Einheitliche Blätter im A4 mit demselben
// Kopfbild-Schema. Hinweis: Die Textbausteine sind sorgfältige Standard-
// vorlagen, keine Rechtsberatung — der Händler lässt die Verträge final
// prüfen bzw. pflegt individuelle Klauseln in den Einstellungen.

export interface PdfCompany {
  companyName: string;
  addressLine: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  vatNumber: string;
}

const MARGIN = 56;
const PAGE_WIDTH = 595.28; // A4 in pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** CHF-Betrag im Schweizer Format (1'234.50 CHF). */
export function formatChf(value: number, withSuffix = true): string {
  const n = new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return withSuffix ? `${n} CHF` : n;
}

export function formatDateDe(date: Date): string {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "long" }).format(date);
}

/** PDF in den Speicher rendern; der Builder zeichnet direkt auf das Dokument. */
export function renderPdf(
  build: (doc: PDFKit.PDFDocument) => void,
  opts: { size?: string; layout?: "portrait" | "landscape" } = {},
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: opts.size ?? "A4",
    layout: opts.layout ?? "portrait",
    margin: MARGIN,
    info: { Creator: "MyLittleCarDealership" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  build(doc);
  doc.end();
  return done;
}

export class PdfBuilder {
  readonly doc: PDFKit.PDFDocument;

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
  }

  // ── Kopfbereich: Firma links, Ort/Datum rechts, Trennlinie, Titel ──────

  header(company: PdfCompany, title: string, date: Date): void {
    const doc = this.doc;
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827").text(company.companyName);
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
    const lines = [
      company.addressLine,
      [company.zip, company.city].filter(Boolean).join(" "),
      [company.phone, company.email].filter(Boolean).join(" · "),
      company.website,
      company.vatNumber ? `MWST-Nr. ${company.vatNumber}` : "",
    ].filter(Boolean);
    doc.text(lines.join("\n"));
    // PDFKit übernimmt x/y aus dem letzten text()-Aufruf — nach dem
    // rechtsbündigen Datum explizit auf den linken Textfluss zurückstellen.
    const flowY = doc.y;
    doc.text(formatDateDe(date), MARGIN + CONTENT_WIDTH - 160, MARGIN + 6, { width: 160, align: "right" });
    doc.x = MARGIN;
    doc.y = flowY;
    doc.moveDown(1.2);
    doc.moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y).lineWidth(1).strokeColor("#d1d5db").stroke();
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827").text(title, MARGIN, doc.y);
    doc.moveDown(0.8);
  }

  /** Adress-Block (Empfänger oben links). */
  addressBlock(lines: string[]): void {
    this.doc.x = MARGIN;
    this.doc.font("Helvetica").fontSize(10).fillColor("#374151").text(lines.filter(Boolean).join("\n"));
    this.doc.moveDown(1.2);
  }

  sectionTitle(text: string): void {
    this.doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(text.toUpperCase());
    this.doc.moveDown(0.3);
  }

  paragraph(text: string): void {
    this.doc.font("Helvetica").fontSize(10).fillColor("#374151").text(text, { lineGap: 2.5 });
    this.doc.moveDown(0.5);
  }

  /** Zeilen "Label ....... Wert" als sauberes zweispaltiges Layout. */
  keyValues(rows: [string, string][]): void {
    const doc = this.doc;
    const labelWidth = 190;
    for (const [label, value] of rows) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text(label, MARGIN, y, { width: labelWidth });
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(value, MARGIN + labelWidth, y, {
        width: CONTENT_WIDTH - labelWidth,
      });
      // Höhe der zweizeiligen Zellen berücksichtigen.
      doc.y = Math.max(doc.y, y + doc.currentLineHeight());
      doc.x = MARGIN;
      doc.moveDown(0.45);
    }
    doc.moveDown(0.4);
  }

  /** Hervorgehobene Box (z. B. Ankaufspreis). */
  highlightBox(text: string, sub?: string): void {
    const doc = this.doc;
    const y = doc.y;
    const height = sub ? 64 : 46;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 8).fill("#f9fafb");
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 8).lineWidth(1.5).strokeColor("#f59e0b").stroke();
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827").text(text, MARGIN + 20, y + (sub ? 14 : 16));
    if (sub) {
      doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(sub, MARGIN + 20, y + 38);
    }
    doc.x = MARGIN;
    doc.y = y + height + 16;
  }

  /** Textzeilen als Liste mit Spiegelstrichen. */
  bulletList(items: string[]): void {
    for (const item of items) {
      this.doc.font("Helvetica").fontSize(10).fillColor("#374151").text(`•  ${item}`, { lineGap: 2 });
    }
    this.doc.moveDown(0.6);
  }

  /** Unterschriftsblöcke links und rechts (nach unten versetzt ans Seitenende). */
  signatures(leftLabel: string, rightLabel: string): void {
    const doc = this.doc;
    doc.moveDown(2.5);
    const y = Math.max(doc.y, 672);
    const colWidth = CONTENT_WIDTH / 2 - 20;
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
    doc.text(leftLabel, MARGIN, y, { width: colWidth });
    doc.text(rightLabel, MARGIN + colWidth + 40, y, { width: colWidth });
    doc.moveTo(MARGIN, y + 40).lineTo(MARGIN + colWidth, y + 40).lineWidth(0.75).strokeColor("#9ca3af").stroke();
    doc
      .moveTo(MARGIN + colWidth + 40, y + 40)
      .lineTo(MARGIN + colWidth * 2 + 40, y + 40)
      .stroke();
    doc.fontSize(8).fillColor("#9ca3af");
    doc.text("Ort, Datum, Unterschrift", MARGIN, y + 46, { width: colWidth });
    doc.text("Ort, Datum, Unterschrift", MARGIN + colWidth + 40, y + 46, { width: colWidth });
    doc.x = MARGIN;
    doc.y = y + 60;
  }

  footerNote(text: string): void {
    const doc = this.doc;
    doc.moveDown(0.8);
    doc.font("Helvetica").fontSize(8).fillColor("#9ca3af").text(text, {
      width: CONTENT_WIDTH,
    });
  }
}
