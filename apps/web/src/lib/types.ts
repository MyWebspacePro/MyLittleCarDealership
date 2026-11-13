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

export const SALE_PAYMENT_LABELS: Record<SalePaymentMethod, string> = {
  BAR: "Barzahlung",
  UEBERWEISUNG: "Banküberweisung",
  LEASING: "Leasing",
  FINANZIERUNG: "Finanzierung",
};

export type SaleStatus = "INTERESSENT" | "RESERVIERT" | "VERKAUFT" | "ABGESCHLOSSEN";

export const SALE_STATUSES = ["INTERESSENT", "RESERVIERT", "VERKAUFT", "ABGESCHLOSSEN"] as SaleStatus[];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  INTERESSENT: "Interessent",
  RESERVIERT: "Reserviert",
  VERKAUFT: "Verkauft",
  ABGESCHLOSSEN: "Abgeschlossen",
};

export const SALE_STATUS_STYLES: Record<SaleStatus, string> = {
  INTERESSENT: "bg-slate-100 text-slate-600",
  RESERVIERT: "bg-amber-100 text-amber-700",
  VERKAUFT: "bg-emerald-100 text-emerald-700",
  ABGESCHLOSSEN: "bg-indigo-100 text-indigo-700",
};

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

export interface SaleAddon {
  id: string;
  name: string;
  provider: string | null;
  price: number | null;
}

export interface PaymentInfo {
  id: string;
  direction: "EINGANG" | "AUSGANG";
  amount: number;
  method: string | null;
  paidAt: string;
  notes: string | null;
  gwgIdentifiedAt: string | null;
  gwgIdDocument: string | null;
}

export interface InvoiceInfo {
  id: string;
  number: string;
  status: InvoiceStatus;
  subject: string | null;
  isCredit: boolean;
  reason: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  issuedAt: string | null;
  dueAt: string | null;
  reminderLevel: number;
  reminderDueAt: string | null;
  qrReference: string | null;
  vehicleTitle: string | null;
  createdAt: string;
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
  leasingMonthlyRate: number | null;
  leasingTermMonths: number | null;
  leasingDownPayment: number | null;
  tradeInCredit: number | null;
  tradeInDescription: string | null;
  soldAt: string | null;
  notes: string | null;
  openAmount: number | null;
  addons: SaleAddon[];
  payments: PaymentInfo[];
  invoices: InvoiceInfo[];
}

export type InvoiceStatus = "ENTWURF" | "VERSANDT" | "TEILZAHLUNG" | "BEZAHLT" | "STORNIERT";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  ENTWURF: "Entwurf",
  VERSANDT: "Versandt",
  TEILZAHLUNG: "Teilzahlung",
  BEZAHLT: "Bezahlt",
  STORNIERT: "Storniert",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  ENTWURF: "bg-slate-100 text-slate-600",
  VERSANDT: "bg-sky-100 text-sky-700",
  TEILZAHLUNG: "bg-amber-100 text-amber-700",
  BEZAHLT: "bg-emerald-100 text-emerald-700",
  STORNIERT: "bg-rose-100 text-rose-700",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BAR: "Bar",
  UEBERWEISUNG: "Überweisung",
  LEASING: "Leasing",
  FINANZIERUNG: "Finanzierung",
  EINTAUSCH: "Eintausch",
  SONSTIGES: "Sonstiges",
};

export const REMINDER_LEVEL_LABELS: Record<number, string> = {
  0: "—",
  1: "Erinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung",
};

export interface ReportSummary {
  year: number;
  bestandswert: number;
  umsatz: number;
  deckungsbeitrag: {
    vehicleId: string;
    vehicleTitle: string;
    purchasePrice: number | null;
    prepCosts: number;
    salePrice: number | null;
    margin: number | null;
    soldAt: string | null;
  }[];
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
    openAmount: number | null;
  } | null;
}

export interface VehicleDetail extends VehicleBase {
  description: string | null;
  equipment: string[];
  photos: VehiclePhoto[];
  documents: VehicleDocument[];
  purchase: PurchaseDeal | null;
  sale: SaleDeal | null;
  generatedDocuments: GeneratedDocumentInfo[];
  workOrders: WorkOrder[];
  inquiries: Inquiry[];
  appointments: Appointment[];
}

export function chf(value: number | null | undefined): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(value));
}

// ── Ankauf: Posteingang (Leads) ──────────────────────────────────────────────

export type LeadStatus = "NEU" | "GEPRUEFT" | "UEBERNOMMEN" | "VERWORFEN";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEU: "Neu",
  GEPRUEFT: "Geprüft",
  UEBERNOMMEN: "Übernommen",
  VERWORFEN: "Verworfen",
};

export const LEAD_STATUS_STYLES: Record<LeadStatus, string> = {
  NEU: "bg-amber-50 text-amber-700 ring-amber-200",
  GEPRUEFT: "bg-blue-50 text-blue-700 ring-blue-200",
  UEBERNOMMEN: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  VERWORFEN: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[];

export type LeadFileKind = "FOTO" | "FAHRZEUGAUSWEIS" | "SONSTIGES";

export const LEAD_FILE_KIND_LABELS: Record<LeadFileKind, string> = {
  FOTO: "Foto",
  FAHRZEUGAUSWEIS: "Fahrzeugausweis",
  SONSTIGES: "Sonstiges",
};

export interface LeadFile {
  id: string;
  leadId: string;
  kind: LeadFileKind;
  filename: string;
  originalName: string | null;
  createdAt: string;
}

export interface PurchaseLead {
  id: string;
  status: LeadStatus;
  channel: PurchaseChannel;
  sellerName: string | null;
  sellerPhone: string | null;
  sellerEmail: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  mileageKm: number | null;
  year: number | null;
  askingPrice: number | null;
  message: string | null;
  assignedToId: string | null;
  vehicleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadListItem extends PurchaseLead {
  photoCount: number;
  documentCount: number;
  vehicle: { id: string; make: string; model: string; status: VehicleStatus } | null;
  assignedTo: { name: string } | null;
}

export interface LeadDetail extends LeadListItem {
  files: LeadFile[];
}

export interface GeneratedDocumentInfo {
  id: string;
  vehicleId: string | null;
  documentType: "ANKAUF_ANGEBOT" | "ANKAUF_VERTRAG" | "KAUFVERTRAG" | "RECHNUNG" | "TAFAEL" | "ZUSAMMENFASSUNG" | "SONSTIGES";
  title: string;
  createdAt: string;
}

export const GENERATED_DOC_LABELS: Record<GeneratedDocumentInfo["documentType"], string> = {
  ANKAUF_ANGEBOT: "Ankaufsangebot",
  ANKAUF_VERTRAG: "Ankaufsvertrag",
  KAUFVERTRAG: "Kaufvertrag",
  RECHNUNG: "Rechnung",
  TAFAEL: "A3-Tafel",
  ZUSAMMENFASSUNG: "Verkaufszusammenfassung",
  SONSTIGES: "Sonstiges",
};

// ── Aufbereitung: Aufträge & Anbieter ────────────────────────────────────────

export type WorkOrderType = "REPARATUR" | "SERVICE" | "AUFBEREITUNG" | "MFK" | "SONSTIGES";

export const WORK_ORDER_TYPES = Object.keys({
  REPARATUR: "",
  SERVICE: "",
  AUFBEREITUNG: "",
  MFK: "",
  SONSTIGES: "",
}) as WorkOrderType[];

export const WORK_ORDER_TYPE_LABELS: Record<WorkOrderType, string> = {
  REPARATUR: "Reparatur",
  SERVICE: "Service / Wartung",
  AUFBEREITUNG: "Aufbereitung",
  MFK: "MFK",
  SONSTIGES: "Sonstiges",
};

export type ProviderType = "INTERN" | "MARKENWERKSTATT" | "PARTNERWERKSTATT" | "EXTERN" | "AUFBEREITER";

export const PROVIDER_TYPES = Object.keys({
  INTERN: "",
  MARKENWERKSTATT: "",
  PARTNERWERKSTATT: "",
  EXTERN: "",
  AUFBEREITER: "",
}) as ProviderType[];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  INTERN: "Intern",
  MARKENWERKSTATT: "Markenwerkstatt",
  PARTNERWERKSTATT: "Partnerwerkstatt",
  EXTERN: "Extern",
  AUFBEREITER: "Aufbereiter",
};

export type WorkOrderStatus = "GEPLANT" | "IN_ARBEIT" | "FERTIG" | "ABGESCHLOSSEN";

export const WORK_ORDER_STATUSES = Object.keys({
  GEPLANT: "",
  IN_ARBEIT: "",
  FERTIG: "",
  ABGESCHLOSSEN: "",
}) as WorkOrderStatus[];

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  GEPLANT: "Geplant",
  IN_ARBEIT: "In Arbeit",
  FERTIG: "Fertig",
  ABGESCHLOSSEN: "Abgeschlossen",
};

export const WORK_ORDER_STATUS_STYLES: Record<WorkOrderStatus, string> = {
  GEPLANT: "bg-slate-100 text-slate-700 ring-slate-200",
  IN_ARBEIT: "bg-amber-50 text-amber-700 ring-amber-200",
  FERTIG: "bg-blue-50 text-blue-700 ring-blue-200",
  ABGESCHLOSSEN: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export interface Provider {
  id: string;
  name: string;
  providerType: ProviderType;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface WorkOrder {
  id: string;
  vehicleId: string;
  type: WorkOrderType;
  providerType: ProviderType;
  providerId: string | null;
  provider: { id: string; name: string } | null;
  providerName: string | null;
  description: string;
  status: WorkOrderStatus;
  costEstimate: number | null;
  costActual: number | null;
  plannedFor: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

// ── Verkauf: Anfragen & Termine ──────────────────────────────────────────────

// Katalog der wichtigsten Sonderausstattungen für die Klick-Maske
// (Tafel + Exposé + AutoScout24-Vorbereitung).
export const EQUIPMENT_CATALOG: string[] = [
  "ABS",
  "Adaptive Cruise Control (ACC)",
  "Airbag",
  "Allradantrieb",
  "Anhängerkupplung",
  "Berganfahrhilfe",
  "Bluetooth / Freisprecheinrichtung",
  "Dachreling",
  "Einparkhilfe",
  "Elektr. Fensterheber",
  "Elektr. Heckklappe",
  "Elektr. Sitze",
  "Head-Up Display",
  "Isofix",
  "Klimaanlage",
  "Kurvenlicht",
  "LED / Matrix-LED Scheinwerfer",
  "Lederlenkrad",
  "Leichtmetallfelgen",
  "Multifunktionslenkrad",
  "Navi & App-Connect",
  "Panorama-Glasdach",
  "Regensensor",
  "Rückfahrkamera",
  "Sitzheizung",
  "Sportsitze",
  "Start/Stopp-Automatik",
  "Tempomat",
  "Winterräder",
  "Zentralverriegelung",
];

export interface ContactRef {
  id: string;
  displayName: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
}

export interface Inquiry {
  id: string;
  vehicleId: string | null;
  contactId: string | null;
  contact: ContactRef | null;
  contactName: string | null;
  channel: PurchaseChannel;
  subject: string | null;
  summary: string | null;
  nextFollowUpAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type AppointmentType = "BESICHTIGUNG" | "PROBEFAHRT" | "RUECKRUF" | "WERKSTATT" | "SONSTIGES";

export const APPOINTMENT_TYPES = Object.keys({
  BESICHTIGUNG: "",
  PROBEFAHRT: "",
  RUECKRUF: "",
  WERKSTATT: "",
  SONSTIGES: "",
}) as AppointmentType[];

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  BESICHTIGUNG: "Besichtigung",
  PROBEFAHRT: "Probefahrt",
  RUECKRUF: "Rückruf",
  WERKSTATT: "Werkstatt",
  SONSTIGES: "Sonstiges",
};

export type AppointmentStatus = "GEPLANT" | "ERLEDIGT" | "ABGESAGT";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  GEPLANT: "Geplant",
  ERLEDIGT: "Erledigt",
  ABGESAGT: "Abgesagt",
};

export const APPOINTMENT_STATUS_STYLES: Record<AppointmentStatus, string> = {
  GEPLANT: "bg-blue-50 text-blue-700 ring-blue-200",
  ERLEDIGT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ABGESAGT: "bg-slate-100 text-slate-500 ring-slate-200",
};

export interface Appointment {
  id: string;
  vehicleId: string | null;
  vehicle: { id: string; make: string; model: string; status: VehicleStatus } | null;
  contactId: string | null;
  contact: ContactRef | null;
  type: AppointmentType;
  title: string;
  startsAt: string;
  endsAt: string | null;
  status: AppointmentStatus;
  notes: string | null;
}

/** Swiss Telefonnummer -> wa.me-Link (079… -> 4179…). */
export function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `41${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

// ── Phase H: Posteingang-E-Mails + CRM-Kommunikationshistorie ────────────────

export type EmailStatus = "NEU" | "GESEHEN" | "ZUGEORDNET";

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  NEU: "Neu",
  GESEHEN: "Gesehen",
  ZUGEORDNET: "Zugeordnet",
};

export const EMAIL_STATUS_STYLES: Record<EmailStatus, string> = {
  NEU: "bg-amber-100 text-amber-700",
  GESEHEN: "bg-slate-100 text-slate-600",
  ZUGEORDNET: "bg-emerald-100 text-emerald-700",
};

export interface EmailLogInfo {
  id: string;
  fromName: string | null;
  fromEmail: string;
  subject: string | null;
  body: string | null;
  receivedAt: string;
  status: EmailStatus;
  isNewContact: boolean;
  attachments: string[];
  contactId: string | null;
  contactName: string | null;
}

export type CommunicationDirection = "EINGANG" | "AUSGANG" | "NOTIZ";

export const COMMUNICATION_DIRECTION_LABELS: Record<CommunicationDirection, string> = {
  EINGANG: "Eingang",
  AUSGANG: "Ausgang",
  NOTIZ: "Notiz",
};

export const COMMUNICATION_DIRECTION_STYLES: Record<CommunicationDirection, string> = {
  EINGANG: "bg-sky-100 text-sky-700",
  AUSGANG: "bg-indigo-100 text-indigo-700",
  NOTIZ: "bg-slate-100 text-slate-600",
};

export type CommunicationSource = "MANUAL" | "EMAIL" | "WEBFORM";

export const COMMUNICATION_SOURCE_LABELS: Record<CommunicationSource, string> = {
  MANUAL: "Manuell",
  EMAIL: "E-Mail",
  WEBFORM: "Web-Formular",
};

export interface CommunicationEntry {
  id: string;
  contactId: string | null;
  vehicleId: string | null;
  vehicleTitle: string | null;
  channel: PurchaseChannel;
  direction: CommunicationDirection;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  source: CommunicationSource;
  emailLogId: string | null;
  createdAt: string;
}

export interface CustomerInvoiceInfo {
  id: string;
  number: string;
  status: InvoiceStatus;
  isCredit: boolean;
  subject: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  issuedAt: string | null;
  dueAt: string | null;
  reminderLevel: number;
  vehicle: { id: string; make: string; model: string; status: string } | null;
  saleId: string;
}

export interface CustomerPaymentInfo {
  id: string;
  direction: "EINGANG" | "AUSGANG";
  amount: number;
  method: string | null;
  paidAt: string;
  vehicle: { id: string; make: string; model: string; status: string } | null;
  saleId: string;
}

export interface ContactDetail extends Contact {
  dealCount: number;
  inquiryCount: number;
  appointmentCount: number;
  purchasesAsSeller: {
    id: string;
    status: PurchaseStatus;
    channel: PurchaseChannel;
    purchasePrice: number | null;
    createdAt: string;
    vehicle: { id: string; make: string; model: string; status: string } | null;
  }[];
  salesAsBuyer: {
    id: string;
    status: SaleStatus;
    salePrice: number | null;
    createdAt: string;
    vehicle: { id: string; make: string; model: string; status: string } | null;
  }[];
  invoices: CustomerInvoiceInfo[];
  payments: CustomerPaymentInfo[];
}
