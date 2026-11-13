// Räumt generierte Test-/Demo-Artefakte (PDFs, Rechnungen, Zahlungen) weg und
// setzt die Zähler zurück — der Verkaufsvorgang mit Zusatzleistung bleibt für
// die Demo bestehen. Idempotent, lokal wie auf dem VPS identisch ausführbar:
//   npx tsx prisma/clean-demo.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const golf = await prisma.vehicle.findFirst({ where: { chassisNumber: "WVWZZZAU8WA123456" } });
  if (!golf) throw new Error("Demo-Golf fehlt — zuerst seed-demo ausführen");
  const docs = await prisma.generatedDocument.findMany({
    where: { vehicleId: golf.id, documentType: { in: ["RECHNUNG", "MAHNUNG", "KAUFVERTRAG", "ZUSAMMENFASSUNG", "LEASING_DOSSIER"] } },
  });
  for (const d of docs) await prisma.generatedDocument.delete({ where: { id: d.id } });
  const sale = await prisma.saleDeal.findUnique({ where: { vehicleId: golf.id } });
  if (sale) {
    await prisma.payment.deleteMany({ where: { saleDealId: sale.id } });
    await prisma.invoice.deleteMany({ where: { saleDealId: sale.id } });
    await prisma.saleDeal.update({
      where: { id: sale.id },
      data: { notes: "Herr Hofer aus Schaffhausen, Reservierung bis Ende der Woche." },
    });
  }
  await prisma.setting.update({ where: { id: 1 }, data: { invoiceCounter: 1, qrrCounter: 1 } });
  console.log("Demo-Artefakte gereinigt (Verkaufsvorgang + Zusatzleistung bleiben)");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
