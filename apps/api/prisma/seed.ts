import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Idempotenter Basis-Seed: legt den Musterhaendler und die drei Demo-Logins an.
// ACHTUNG: Passwoerter bestehender Benutzer werden NICHT ueberschrieben — nur
// beim Anlegen gesetzt. Der Seed kann also gefahrlos wiederholt werden.
const prisma = new PrismaClient();

const DEMO_PASSWORD = "changeme";

const users = [
  { email: "chef@mylittlecardealership.ch", name: "Geschäftsleitung", jobTitle: "Inhaber", role: "ADMIN" as const },
  { email: "verkauf@mylittlecardealership.ch", name: "Verkauf", jobTitle: "Verkaufsberater", role: "SALES" as const },
  { email: "buchhaltung@mylittlecardealership.ch", name: "Buchhaltung", jobTitle: "Buchhaltung", role: "FINANCE" as const },
];

async function main() {
  await prisma.setting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      companyName: "MyLittleCarDealership Muster AG",
      addressLine: "Musterstrasse 1",
      zip: "8000",
      city: "Zürich",
      phone: "044 000 00 00",
      email: "info@mylittlecardealership.ch",
      website: "https://mylittlecardealership.aiconso.eu",
      vatNumber: "CHE-123.456.789 MWST",
      iban: "CH00 0000 0000 0000 0000 0",
      bankName: "Musterbank",
      paymentDays: 30,
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { ...u, passwordHash },
      update: { name: u.name, jobTitle: u.jobTitle, role: u.role, active: true },
    });
  }

  const count = await prisma.user.count();
  console.log(`Seed fertig: ${count} Benutzer, Einstellungen angelegt.`);
  console.log(`Demo-Login: ${users.map((u) => u.email).join(", ")} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());