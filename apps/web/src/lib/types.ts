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
  qrIban: string;
  qrrCounter: number;
  as24PortalUrl: string;
  targetProfitDefault: number;
  warrantyText: string;
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

// ── Schaltzentrale: Kunden & Fahrzeuge ───────────────────────────────────────

export type ContactType = "PRIVAT" | "FIRMA";

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  PRIVAT: "Privatkunde",
  FIRMA: "Firmenkunde",
};

export interface Contact {
  id: string;
  type: ContactType;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  notes: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListItem extends Contact {
  dealCount: number;
  inquiryCount: number;
}

export type VehicleStatus =
  | "ANGEFRAGT"
  | "KALKULATION"
  | "ANGEBOT"
  | "GEKAUFT"
  | "AUFBEREITUNG"
  | "VERKAUF"
  | "VERKAUFT"
  | "ABGESCHLOSSEN"
  | "ABGELEHNT";

export const VEHICLE_STATUSES: VehicleStatus[] = [
  "ANGEFRAGT",
  "KALKULATION",
  "ANGEBOT",
  "GEKAUFT",
  "AUFBEREITUNG",
  "VERKAUF",
  "VERKAUFT",
  "ABGESCHLOSSEN",
  "ABGELEHNT",
];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  ANGEFRAGT: "Angefragt",
  KALKULATION: "In Kalkulation",
  ANGEBOT: "Angebot",
  GEKAUFT: "Gekauft",
  AUFBEREITUNG: "In Aufbereitung",
  VERKAUF: "Im Verkauf",
  VERKAUFT: "Verkauft",
  ABGESCHLOSSEN: "Abgeschlossen",
  ABGELEHNT: "Abgelehnt",
};

// Tailwind-Klassen pro Pipeline-Status (Badge-Farben).
export const VEHICLE_STATUS_STYLES: Record<VehicleStatus, string> = {
  ANGEFRAGT: "bg-slate-100 text-slate-700 ring-slate-200",
  KALKULATION: "bg-amber-50 text-amber-700 ring-amber-200",
  ANGEBOT: "bg-orange-50 text-orange-700 ring-orange-200",
  GEKAUFT: "bg-blue-50 text-blue-700 ring-blue-200",
  AUFBEREITUNG: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  VERKAUF: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  VERKAUFT: "bg-violet-50 text-violet-700 ring-violet-200",
  ABGESCHLOSSEN: "bg-slate-900 text-white ring-slate-900",
  ABGELEHNT: "bg-rose-50 text-rose-700 ring-rose-200",
};

export type PurchaseChannel = "WEBFORM" | "WHATSAPP" | "EMAIL" | "TELEFON" | "PERSOENLICH" | "AUTOSCOUT24" | "SONSTIGE";

export const PURCHASE_CHANNEL_LABELS: Record<PurchaseChannel, string> = {
  WEBFORM: "Web-Formular",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-Mail",
  TELEFON: "Telefon",
  PERSOENLICH: "Persönlich",
  AUTOSCOUT24: "AutoScout24",
  SONSTIGE: "Sonstige",
};

export const PURCHASE_CHANNELS = Object.keys(PURCHASE_CHANNEL_LABELS) as PurchaseChannel[];

export type PurchaseStatus = "LEAD" | "KALKULIERT" | "ANGEBOT_ERSTELLT" | "ANGEBOT_ANGENOMMEN" | "ABGESCHLOSSEN" | "ABGELEHNT";

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  LEAD: "Erstkontakt",
  KALKULIERT: "Kalkuliert",
  ANGEBOT_ERSTELLT: "Angebot versendet",
  ANGEBOT_ANGENOMMEN: "Angebot angenommen",
  ABGESCHLOSSEN: "Angekauft",
  ABGELEHNT: "Abgelehnt",
};

export const PURCHASE_STATUSES = Object.keys(PURCHASE_STATUS_LABELS) as PurchaseStatus[];

export type PurchasePaymentMethod = "BAR" | "UEBERWEISUNG" | "EINTAUSCH";

export const PURCHASE_PAYMENT_LABELS: Record<PurchasePaymentMethod, string> = {
  BAR: "Bar",
  UEBERWEISUNG: "Überweisung",
  EINTAUSCH: "Eintausch",
};

export type ValuationKind = "AUFBEREITUNG" | "REPARATUR" | "SERVICE" | "SONSTIGES";

export const VALUATION_KIND_LABELS: Record<ValuationKind, string> = {
  AUFBEREITUNG: "Aufbereitung",
  REPARATUR: "Reparatur",
  SERVICE: "Service",
  SONSTIGES: "Sonstiges",
};

export const VALUATION_KINDS = Object.keys(VALUATION_KIND_LABELS) as ValuationKind[];

export type SalePaymentMethod = "BAR" | "UEBERWEISUNG" | "LEASING" | "FINANZIERUNG";

export type SaleStatus = "INTERESSENT" | "RESERVIERT" | "VERKAUFT" | "ABGESCHLOSSEN";

export type DocumentKind = "FAHRZEUGAUSWEIS" | "SERVICEHEFT" | "BERICHT" | "SONSTIGES";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  FAHRZEUGAUSWEIS: "Fahrzeugausweis",
  SERVICEHEFT: "Serviceheft",
  BERICHT: "Zustandsbericht",
  SONSTIGES: "Sonstiges",
};

export const DOCUMENT_KINDS = Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[];

export interface ValuationItem {
  id: string;
  kind: ValuationKind;
  description: string;
  amount: number;
}

export interface PurchaseDeal {
  id: string;
  vehicleId: string;
  sellerId: string | null;
  sellerName: string | null;
  status: PurchaseStatus;
  channel: PurchaseChannel;
  paymentMethod: PurchasePaymentMethod;
  purchasePrice: number | null;
  recommendedPrice: number | null;
  targetProfit: number | null;
  estimatedSalePrice: number | null;
  paymentDueDate: string | null;
  purchasedAt: string | null;
  notes: string | null;
  costsTotal: number;
  projectedProfit: number | null;
  valuationItems: ValuationItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleDeal {
  id: string;
  vehicleId: string;
  buyerId: string | null;
  buyerName: string | null;
  status: SaleStatus;
  salePrice: number | null;
  paymentMethod: SalePaymentMethod;
  leasingPartner: string | null;
  soldAt: string | null;
  notes: string | null;
}

export interface VehiclePhoto {
  id: string;
  vehicleId: string;
  filename: string;
  originalName: string | null;
  sortOrder: number;
  caption: string | null;
  createdAt: string;
}

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  kind: DocumentKind;
  filename: string;
  originalName: string | null;
  createdAt: string;
}

export interface VehicleBase {
  id: string;
  status: VehicleStatus;
  statusChangedAt: string;
  daysInStatus: number;
  make: string;
  model: string;
  variant: string | null;
  chassisNumber: string | null;
  firstRegistration: string | null;
  mileageKm: number | null;
  fuel: string | null;
  transmission: string | null;
  color: string | null;
  plates: string | null;
  mfkUntil: string | null;
  hasServiceBook: boolean;
  targetSalePrice: number | null;
  as24Url: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleListItem extends VehicleBase {
  coverPhoto: string | null;
  photosCount: number;
  purchase: {
    id: string;
    status: PurchaseStatus;
    channel: PurchaseChannel;
    purchasePrice: number | null;
    recommendedPrice: number | null;
    estimatedSalePrice: number | null;
    paymentMethod: PurchasePaymentMethod;
    sellerName: string | null;
  } | null;
  sale: {
    id: string;
    status: SaleStatus;
    salePrice: number | null;
    paymentMethod: SalePaymentMethod;
    buyerName: string | null;
  } | null;
}

export interface VehicleDetail extends VehicleBase {
  description: string | null;
  photos: VehiclePhoto[];
  documents: VehicleDocument[];
  purchase: PurchaseDeal | null;
  sale: SaleDeal | null;
  workOrders: {
    id: string;
    vehicleId: string;
    type: string;
    providerType: string;
    providerName: string | null;
    description: string;
    status: string;
    costEstimate: number | null;
    costActual: number | null;
    plannedFor: string | null;
    completedAt: string | null;
    notes: string | null;
    createdAt: string;
  }[];
  inquiries: {
    id: string;
    vehicleId: string | null;
    contactId: string | null;
    channel: string;
    subject: string | null;
    summary: string | null;
    nextFollowUpAt: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }[];
  appointments: {
    id: string;
    vehicleId: string | null;
    contactId: string | null;
    type: string;
    title: string;
    startsAt: string;
    endsAt: string | null;
    status: string;
    notes: string | null;
  }[];
}

export function chf(value: number | null | undefined): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(value));
}
