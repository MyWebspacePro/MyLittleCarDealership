// Demo-Daten für die Schaltzentrale (Ankauf → Verkauf).
// Idempotent: Fahrzeuge werden über die Stammnummer upsertet, Kontakte über
// die E-Mail gesucht. Läuft lokal wie auf dem VPS (Lokal=VPS-Regel):
//   npx tsx --env-file=.env prisma/seed-demo.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureContact(data: {
  email: string;
  type: "PRIVAT" | "FIRMA";
  firstName?: string;
  lastName?: string;
  companyName?: string;
  phone?: string;
  mobile?: string;
  street?: string;
  zip?: string;
  city?: string;
  notes?: string;
}) {
  const existing = await prisma.contact.findFirst({ where: { email: data.email } });
  if (existing) return existing;
  return prisma.contact.create({ data });
}

async function ensureVehicle(
  chassisNumber: string,
  data: {
    make: string;
    model: string;
    variant?: string;
    firstRegistration?: Date;
    mileageKm?: number;
    fuel?: string;
    transmission?: string;
    color?: string;
    plates?: string;
    mfkUntil?: Date;
    hasServiceBook?: boolean;
    targetSalePrice?: number;
    description?: string;
    as24Url?: string;
    status?: string;
  },
) {
  return prisma.vehicle.upsert({
    where: { chassisNumber },
    create: { ...data, chassisNumber },
    update: { ...data, chassisNumber },
  });
}

async function ensurePurchase(
  vehicleId: string,
  data: {
    sellerId?: string | null;
    status?: string;
    channel?: string;
    paymentMethod?: string;
    purchasePrice?: number;
    estimatedSalePrice?: number;
    targetProfit?: number;
    purchasedAt?: Date;
    notes?: string;
  },
  items: { kind: string; description: string; amount: number }[],
) {
  const existing = await prisma.purchaseDeal.findUnique({ where: { vehicleId } });
  if (existing) return existing;
  const deal = await prisma.purchaseDeal.create({ data: { ...data, vehicleId } });
  if (items.length) {
    await prisma.valuationItem.createMany({
      data: items.map((item) => ({ ...item, purchaseDealId: deal.id })),
    });
    // Empfehlungspreis nach der Regel des Ankauf-Moduls nachführen.
    const costs = items.reduce((sum, item) => sum + item.amount, 0);
    const targetProfit = data.targetProfit ?? 0;
    if (data.estimatedSalePrice != null) {
      await prisma.purchaseDeal.update({
        where: { id: deal.id },
        data: { recommendedPrice: Math.max(0, Math.round(data.estimatedSalePrice - costs - targetProfit)) },
      });
    }
  }
  return deal;
}

async function ensureLead(key: { sellerPhone: string; make: string }, data: Record<string, unknown>) {
  const existing = await prisma.purchaseLead.findFirst({ where: { sellerPhone: key.sellerPhone, make: key.make } });
  if (existing) return existing;
  return prisma.purchaseLead.create({ data });
}

async function main() {
  const max = await ensureContact({
    email: "max.muster@example.ch",
    type: "PRIVAT",
    firstName: "Max",
    lastName: "Muster",
    mobile: "+41 79 123 45 67",
    phone: "+41 52 620 11 22",
    street: "Musterstrasse 5",
    zip: "8200",
    city: "Schaffhausen",
    notes: "Erstkontakt über das Ankaufsformular. Möchte auf einen kleineren Wagen wechseln.",
  });

  const petra = await ensureContact({
    email: "petra.beispiel@example.ch",
    type: "PRIVAT",
    firstName: "Petra",
    lastName: "Beispiel",
    mobile: "+41 79 234 56 78",
    street: "Beispielweg 12",
    zip: "8203",
    city: "Schaffhausen",
    notes: "Zweiter Verkauf an uns — kaufte 2024 bereits eine Yaris Hybrid.",
  });

  const firma = await ensureContact({
    email: "fleet@musterlogistik.ch",
    type: "FIRMA",
    companyName: "Muster Logistik AG",
    phone: "+41 52 630 44 55",
    street: "Industriestrasse 12",
    zip: "9470",
    city: "Buchs",
    notes: "Flottenfahrzeuge nach 3 Jahren im Ersatz. Verhandelt über Geschäftsführer R. Keller.",
  });

  const golf = await ensureVehicle("WVWZZZAU8WA123456", {
    make: "Volkswagen",
    model: "Golf",
    variant: "1.5 eTSI Life DSG",
    firstRegistration: new Date("2021-05-14"),
    mileageKm: 45300,
    fuel: "Benzin",
    transmission: "Automat",
    color: "Grau metallic",
    plates: "SH-12345",
    mfkUntil: new Date("2027-04-30"),
    hasServiceBook: true,
    targetSalePrice: 22900,
    status: "VERKAUF",
    description:
      "Scheckheftgepflegter Golf 8 mit Matrix-LED, ACC und Kamera. Ein Besitzer, Garagenwagen, Nichtraucherfahrzeug. Neupreis 36'900 CHF.",
    as24Url: "https://www.autoscout24.ch/de/d/vw-golf-etsi-demo-1234567",
  });
  await ensurePurchase(
    golf.id,
    {
      sellerId: max.id,
      status: "ABGESCHLOSSEN",
      channel: "PERSOENLICH",
      paymentMethod: "UEBERWEISUNG",
      purchasePrice: 17800,
      estimatedSalePrice: 22900,
      targetProfit: 2500,
      purchasedAt: new Date("2026-10-28"),
      notes: "Ankauf mit schriftlichem Angebot. Fahrzeugausweis liegt im Ordner.",
    },
    [
      { kind: "AUFBEREITUNG", description: "Innen- und Aussenreinigung, Politur", amount: 600 },
      { kind: "REPARATUR", description: "Steinschlag Frontscheibe reparieren", amount: 350 },
      { kind: "SERVICE", description: "Wartung inkl. Bremsen vorne", amount: 450 },
    ],
  );

  const bmw = await ensureVehicle("WBA5E71060G123456", {
    make: "BMW",
    model: "320d",
    variant: "xDrive Touring M Sport",
    firstRegistration: new Date("2019-09-03"),
    mileageKm: 92500,
    fuel: "Diesel",
    transmission: "Automat",
    color: "Blau metallic",
    plates: "SH-23456",
    mfkUntil: new Date("2026-09-03"),
    hasServiceBook: true,
    targetSalePrice: 27900,
    status: "AUFBEREITUNG",
    description:
      "Langer Servicehistorie-Blick: alle Services bei der Vertretung. Anhängerkupplung, Panorama, Head-Up.",
  });
  await ensurePurchase(
    bmw.id,
    {
      sellerId: petra.id,
      status: "ABGESCHLOSSEN",
      channel: "WHATSAPP",
      paymentMethod: "UEBERWEISUNG",
      purchasePrice: 21500,
      estimatedSalePrice: 27900,
      targetProfit: 2800,
      purchasedAt: new Date("2026-11-06"),
      notes: "Verkäuferin wechselt auf SUV. MFK läuft ab — Renewal beim Service gleich mitmachen.",
    },
    [
      { kind: "SERVICE", description: "Inspektion inkl. Ölservice, Mikrofilter", amount: 520 },
      { kind: "REPARATUR", description: "Klimaanlage nachfüllen, Hinterradlager rechts", amount: 780 },
      { kind: "AUFBEREITUNG", description: "Detailing extern (Kapazität intern belegt)", amount: 450 },
    ],
  );

  const fiat = await ensureVehicle("ZFA3120000E123456", {
    make: "Fiat",
    model: "500",
    variant: "1.0 Hybrid Dolcevita",
    firstRegistration: new Date("2022-03-21"),
    mileageKm: 12800,
    fuel: "Benzin",
    transmission: "Manuell",
    color: "Weiss",
    plates: "SH-34567",
    hasServiceBook: false,
    targetSalePrice: 14900,
    status: "KALKULATION",
    description: "Flottenwagen der Muster Logistik AG, erste Hand, Garagenabstellplatz.",
  });
  await ensurePurchase(
    fiat.id,
    {
      sellerId: firma.id,
      status: "KALKULIERT",
      channel: "WHATSAPP",
      paymentMethod: "UEBERWEISUNG",
      estimatedSalePrice: 14900,
      notes: "Firma ersetzt Poolwagen. Angebot nach Beulen-Einschätzung versenden.",
    },
    [{ kind: "REPARATUR", description: "Kotflügelbeule hinten rechts (extern ausbeulen)", amount: 300 }],
  );

  await ensureVehicle("WAUZZZGY4MA123456", {
    make: "Audi",
    model: "A3",
    variant: "Sportback 35 TFSI S tronic",
    firstRegistration: new Date("2020-11-10"),
    mileageKm: 68900,
    fuel: "Benzin",
    transmission: "Automat",
    color: "Schwarz",
    status: "ANGEFRAGT",
    description: "Telefonische Anfrage von Herrn Muster — Bewertung ausstehend.",
  });

  // Posteingang: unverbundene Ankaufsanfragen (Erstkontakt).
  await ensureLead(
    { sellerPhone: "+41 79 345 67 89", make: "Skoda" },
    {
      status: "NEU",
      channel: "WHATSAPP",
      sellerName: "Ruedi Keller",
      sellerPhone: "+41 79 345 67 89",
      sellerEmail: "ruedi.keller@example.ch",
      make: "Skoda",
      model: "Octavia",
      variant: "1.5 TSI Ambition",
      mileageKm: 58000,
      year: 2020,
      askingPrice: 12500,
      message:
        "Verkaufe wegen Neukauf. Serviceheft vollständig, eine Hand. Kleinere Kratzer hinten links (Fotos im Chat). Fahrzeugausweis schicke ich bei Interesse zu.",
    },
  );
  await ensureLead(
    { sellerPhone: "+41 79 456 78 90", make: "Toyota" },
    {
      status: "GEPRUEFT",
      channel: "EMAIL",
      sellerName: "Sandra Beispiel",
      sellerPhone: "+41 79 456 78 90",
      sellerEmail: "sandra.beispiel@example.ch",
      make: "Toyota",
      model: "Yaris",
      variant: "1.5 Hybrid Trend",
      mileageKm: 71000,
      year: 2019,
      askingPrice: 11000,
      message: "Zweitwagen, Garagenwagen, immer Werkstattserviced. Probefahrt gerne nach Absprache.",
    },
  );

  console.log("Demo-Daten bereit:");
  console.log(`  Kontakte:   max.muster@example.ch, petra.beispiel@example.ch, fleet@musterlogistik.ch`);
  console.log(`  Fahrzeuge:  Golf (VERKAUF), BMW 320d (AUFBEREITUNG), Fiat 500 (KALKULATION), A3 (ANGEFRAGT)`);
  console.log(`  Posteingang: 2 offene Ankaufsanfragen (WhatsApp, E-Mail)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
