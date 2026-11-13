export type Role = "ADMIN" | "SALES" | "FINANCE";

export interface User {
  id: string;
  email: string;
  name: string;
  jobTitle: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface Setting {
  companyName: string;
  addressLine: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  vatNumber: string;
  vatRateStandard: number;
  vatRateReduced: number;
  iban: string;
  bankName: string;
  paymentDays: number;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administration",
  SALES: "Verkauf",
  FINANCE: "Buchhaltung",
};

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: "ADMIN", label: "Administration", description: "Voller Zugriff, inkl. Benutzerverwaltung" },
  { value: "SALES", label: "Verkauf", description: "Beratung, Angebote und Kunden" },
  { value: "FINANCE", label: "Buchhaltung", description: "Rechnungen, Zahlungen, Auswertungen" },
];

export const ROLES: Role[] = ["ADMIN", "SALES", "FINANCE"];