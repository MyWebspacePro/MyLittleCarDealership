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

async function ensureProvider(name: string, data: { providerType: string; phone?: string; email?: string }) {
  const existing = await prisma.provider.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.provider.create({ data: { name, ...data } });
}

async function ensureWorkOrder(vehicleId: string, description: string, data: Record<string, unknown>) {
  const existing = await prisma.workOrder.findFirst({ where: { vehicleId, description } });
  if (existing) return existing;
  return prisma.workOrder.create({ data: { vehicleId, description, ...data } });
}

async function ensureInquiry(vehicleId: string, key: { subject: string }, data: Record<string, unknown>) {
  const existing = await prisma.inquiry.findFirst({ where: { vehicleId, subject: key.subject } });
  if (existing) return existing;
  return prisma.inquiry.create({ data: { vehicleId, ...data } });
}

async function ensureSale(vehicleId: string, data: Record<string, unknown>) {
  const existing = await prisma.saleDeal.findUnique({ where: { vehicleId } });
  if (existing) return existing;
  return prisma.saleDeal.create({ data: { vehicleId, ...data } });
}

async function ensureAddon(saleDealId: string, name: string, data: Record<string, unknown>) {
  const existing = await prisma.saleAddon.findFirst({ where: { saleDealId, name } });
  if (existing) return existing;
  return prisma.saleAddon.create({ data: { saleDealId, name, ...data } });
}

async function ensureAppointment(vehicleId: string, key: { title: string }, data: Record<string, unknown>) {
  const existing = await prisma.appointment.findFirst({ where: { vehicleId, title: key.title } });
  if (existing) return prisma.appointment.update({ where: { id: existing.id }, data });
  return prisma.appointment.create({ data: { vehicleId, ...data } });
}

async function main() {
  // Demo-QR-IBAN (SIX-Testbereich, QR-IDD 30031) für die QR-Rechnung —
  // der Händler ersetzt ihn später durch den eigenen QR-IBAN der Bank.
  const setting = await prisma.setting.findUnique({ where: { id: 1 } });
  if (setting && (!setting.qrIban || setting.qrIban === "CH853003100000000001")) {
    await prisma.setting.update({
      where: { id: 1 },
      data: {
        qrIban: "CH8530031000000000001",
        iban: setting.iban || "CH93 0076 2011 6238 5295 7",
        bankName: setting.bankName || "Demo-Bank Schaffhausen",
      },
    });
  }

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
    equipment: [
      "Matrix-LED Scheinwerfer",
      "Adaptive Cruise Control (ACC)",
      "Rückfahrkamera",
      "Navi & App-Connect",
      "Sitzheizung vorn",
      "Park Distance Control",
      "Tempomat",
      "Multifunktionslenkrad",
    ],
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
  await ensureInquiry(golf.id, { subject: "Telefonat: Zustand & Servicehistorie" }, {
    channel: "TELEFON",
    contactName: "Herr Hofer",
    subject: "Telefonat: Zustand & Servicehistorie",
    summary: "Interessent aus Schaffhausen. Servicehistorie und Zustand geklärt, Preis diskutiert — kommt zur Besichtigung vorbei.",
    resolvedAt: new Date(),
  });
  await ensureInquiry(golf.id, { subject: "WhatsApp: Probefahrt-Anfrage" }, {
    channel: "WHATSAPP",
    contactName: "Herr Hofer",
    subject: "WhatsApp: Probefahrt-Anfrage",
    summary: "Möchte am Samstag eine Probefahrt machen. Versprochene Fotos des Innenraums geschickt.",
    nextFollowUpAt: new Date(Date.now() + 86_400_000),
  });
  // Verkaufsvorgang (Reserviert) mit Zusatzleistung — Phase-E-Demo.
  const golfSale = await ensureSale(golf.id, {
    buyerId: petra.id,
    status: "RESERVIERT",
    salePrice: 22400,
    paymentMethod: "UEBERWEISUNG",
    notes: "Herr Hofer aus Schaffhausen, Reservierung bis Ende der Woche.",
  });
  if (golfSale) {
    await ensureAddon(golfSale.id, "Occasionsgarantie 12 Monate", { provider: "Autogarantie Partner", price: 690 });
  }
  // Demo-Termine: morgen 14:00 bzw. übermorgen 10:00 (stabil für Kalender-Demo).
  const probeStart = new Date();
  probeStart.setDate(probeStart.getDate() + 1);
  probeStart.setHours(14, 0, 0, 0);
  const probeEnd = new Date(probeStart);
  probeEnd.setMinutes(probeEnd.getMinutes() + 45);
  await ensureAppointment(golf.id, { title: "Probefahrt Golf (Familie Hofer)" }, {
    type: "PROBEFAHRT",
    title: "Probefahrt Golf (Familie Hofer)",
    startsAt: probeStart,
    endsAt: probeEnd,
    status: "GEPLANT",
    notes: "Fahrzeug vorbereiten, zweiter Schlüssel bereitlegen. Führerschein kopieren.",
  });

  // Anbieter-Stammdaten (Werkstätten, Aufbereiter, externe Spezialisten).
  const markenWerkstatt = await ensureProvider("BMW Vertretung Schaffhausen", {
    providerType: "MARKENWERKSTATT",
    phone: "+41 52 620 00 00",
  });
  const partnerWerkstatt = await ensureProvider("Auto-Atelier Schaffhausen", {
    providerType: "PARTNERWERKSTATT",
    phone: "+41 52 625 11 11",
  });
  const dellenDoktor = await ensureProvider("Dellen-Doktor", { providerType: "EXTERN", phone: "+41 79 400 20 30" });
  const carpolish = await ensureProvider("CarPolish GmbH", { providerType: "AUFBEREITER", phone: "+41 52 630 40 50" });

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
    equipment: [
      "Anhängerkupplung",
      "Panorama-Glasdach",
      "Head-Up Display",
      "LED-Scheinwerfer",
      "Elektrische Heckklappe",
      "Allrad (xDrive)",
      "Lederlenkrad",
    ],
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
  await ensureWorkOrder(bmw.id, "Klimaanlage nachfüllen, Hinterradlager rechts", {
    type: "REPARATUR",
    providerType: "PARTNERWERKSTATT",
    providerId: partnerWerkstatt.id,
    status: "FERTIG",
    costEstimate: 780,
    costActual: 845,
    completedAt: new Date(),
    notes: "Radlager teurer als kalkuliert (PLUS-Kosten Ersatzteil).",
  });
  await ensureWorkOrder(bmw.id, "Inspektion inkl. Ölservice, Mikrofilter", {
    type: "SERVICE",
    providerType: "MARKENWERKSTATT",
    providerId: markenWerkstatt.id,
    status: "IN_ARBEIT",
    costEstimate: 520,
    plannedFor: new Date(),
    notes: "MFK-Renewal gleich mit machen lassen.",
  });
  await ensureWorkOrder(bmw.id, "Detailing extern (Kapazität intern belegt)", {
    type: "AUFBEREITUNG",
    providerType: "AUFBEREITER",
    providerId: carpolish.id,
    status: "GEPLANT",
    costEstimate: 450,
    plannedFor: new Date(),
  });
  const visitStart = new Date();
  visitStart.setDate(visitStart.getDate() + 2);
  visitStart.setHours(10, 0, 0, 0);
  await ensureAppointment(bmw.id, { title: "Besichtigung BMW 320d (Herr Pfister)" }, {
    type: "BESICHTIGUNG",
    title: "Besichtigung BMW 320d (Herr Pfister)",
    startsAt: visitStart,
    status: "GEPLANT",
    notes: "Reparatur Frontscheibe sollte bis dahin fertig sein.",
  });

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
  console.log(`  Aufträge:    BMW 320d (Fertig/In Arbeit/Geplant) · Anbieter: 4 Partner`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
