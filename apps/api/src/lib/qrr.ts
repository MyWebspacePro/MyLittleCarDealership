// Schweizer QR-Rechnung (SIX IG QR-Bill v2.3): QR-Referenz (27-stellige
// QRR) und Rechnungsnummern. Der QR-IBAN wird in den Stammdaten gepflegt
// (der Händler beantragt ihn bei der Bank); die QR-IDD steckt an Position
// 5-9 des QR-IBANs, die Referenz = QR-IDD + 21-stellige fortlaufende
// Nummer + Prüfziffer (Modulo-10 rekursiv, wie beim ISR-Verfahren).

/** Prüfziffer nach Modulo-10 rekursiv (SIX-Standard). */
export function mod10CheckDigit(digits: string): string {
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const char of digits) {
    if (char < "0" || char > "9") throw new Error("QR-Referenz darf nur Ziffern enthalten");
    carry = table[(Number(char) + carry) % 10] ?? 0;
  }
  return String((10 - carry) % 10);
}

/** 27-stellige QR-Referenz aus QR-IBAN + laufender Nummer. */
export function buildQrReference(qrIban: string, counter: number): string {
  const compact = qrIban.replace(/\s/g, "").toUpperCase();
  if (!/^CH\d{2}3\d{16}$/.test(compact)) {
    throw new Error("Ungültiger QR-IBAN — bitte QR-IBAN in den Einstellungen prüfen (muss mit CH…3… beginnen).");
  }
  const qrIdd = compact.slice(4, 9); // 5 Stellen (Positionen 5-9)
  const sequence = String(counter).padStart(21, "0");
  if (sequence.length > 21) throw new Error("QR-Referenz-Zähler überläuft (max. 21 Stellen)");
  const body = qrIdd + sequence;
  return body + mod10CheckDigit(body);
}

/** QR-Referenz in Sechsergruppen formatiert: 30031 00000 00001 00000 00000 4 */
export function formatQrReference(reference: string): string {
  return reference.replace(/(.{5})(.{5})(.{5})(.{5})(.{5})(.{2})/, "$1 $2 $3 $4 $5 $6");
}

/** Rechnungsnummer im Jahresformat: 2026-014 */
export function formatInvoiceNumber(year: number, counter: number): string {
  return `${year}-${String(counter).padStart(3, "0")}`;
}
