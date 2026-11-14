import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftSquare,
  ArrowRightSquare,
  Bell,
  Check,
  ClipboardCopy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Info,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  QrCode,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";
import { api, apiDownload, apiBlob } from "../lib/api";
import {
  chf,
  formatDate,
  formatDateTime,
  whatsappLink,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_STYLES,
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABELS,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  EQUIPMENT_CATALOG,
  GENERATED_DOC_LABELS,
  PROVIDER_TYPES,
  PROVIDER_TYPE_LABELS,
  PURCHASE_CHANNELS,
  PURCHASE_CHANNEL_LABELS,
  PURCHASE_PAYMENT_LABELS,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
  VALUATION_KINDS,
  VALUATION_KIND_LABELS,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_STYLES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_STYLES,
  WORK_ORDER_TYPES,
  WORK_ORDER_TYPE_LABELS,
  SALE_STATUSES,
  SALE_STATUS_LABELS,
  SALE_STATUS_STYLES,
  SALE_PAYMENT_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  REMINDER_LEVEL_LABELS,
  type Appointment,
  type AppointmentType,
  type ContactListItem,
  type DocumentKind,
  type GeneratedDocumentInfo,
  type Inquiry,
  type Provider,
  type ProviderType,
  type PurchaseDeal,
  type PurchasePaymentMethod,
  type PurchaseStatus,
  type PurchaseChannel,
  type Setting,
  type SalePaymentMethod,
  type SaleStatus,
  type ValuationItem,
  type ValuationKind,
  type VehicleDetail,
  type VehicleStatus,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderType,
} from "../lib/types";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Spinner } from "../components/ui";

type Tab = "uebersicht" | "ankauf" | "auftraege" | "verkauf" | "anfragen" | "termine";

const TABS: { key: Tab; label: string }[] = [
  { key: "uebersicht", label: "Übersicht" },
  { key: "ankauf", label: "Ankauf" },
  { key: "auftraege", label: "Aufträge" },
  { key: "verkauf", label: "Verkauf" },
  { key: "anfragen", label: "Anfragen" },
  { key: "termine", label: "Termine" },
];

type EditForm = {
  make: string;
  model: string;
  variant: string;
  chassisNumber: string;
  firstRegistration: string;
  mileageKm: string;
  fuel: string;
  transmission: string;
  color: string;
  plates: string;
  mfkUntil: string;
  hasServiceBook: boolean;
  targetSalePrice: string;
  as24Url: string;
  description: string;
};

type PurchaseForm = {
  sellerId: string;
  status: PurchaseStatus;
  channel: PurchaseChannel;
  paymentMethod: PurchasePaymentMethod;
  purchasePrice: string;
  estimatedSalePrice: string;
  targetProfit: string;
  paymentDueDate: string;
  purchasedAt: string;
  notes: string;
};

function toEditForm(v: VehicleDetail): EditForm {
  return {
    make: v.make,
    model: v.model,
    variant: v.variant ?? "",
    chassisNumber: v.chassisNumber ?? "",
    firstRegistration: v.firstRegistration ? v.firstRegistration.slice(0, 10) : "",
    mileageKm: v.mileageKm?.toString() ?? "",
    fuel: v.fuel ?? "",
    transmission: v.transmission ?? "",
    color: v.color ?? "",
    plates: v.plates ?? "",
    mfkUntil: v.mfkUntil ? v.mfkUntil.slice(0, 10) : "",
    hasServiceBook: v.hasServiceBook,
    targetSalePrice: v.targetSalePrice?.toString() ?? "",
    as24Url: v.as24Url ?? "",
    description: v.description ?? "",
  };
}

function toPurchaseForm(p: NonNullable<VehicleDetail["purchase"]>, sellerId: string | null): PurchaseForm {
  return {
    sellerId: sellerId ?? "",
    status: p.status,
    channel: p.channel,
    paymentMethod: p.paymentMethod,
    purchasePrice: p.purchasePrice?.toString() ?? "",
    estimatedSalePrice: p.estimatedSalePrice?.toString() ?? "",
    targetProfit: p.targetProfit?.toString() ?? "",
    paymentDueDate: p.paymentDueDate ? p.paymentDueDate.slice(0, 10) : "",
    purchasedAt: p.purchasedAt ? p.purchasedAt.slice(0, 10) : "",
    notes: p.notes ?? "",
  };
}

type WorkOrderForm = {
  type: WorkOrderType;
  providerType: ProviderType;
  providerId: string; // "" = ohne gespeicherten Anbieter (Freitext möglich)
  providerName: string;
  description: string;
  costEstimate: string;
  costActual: string;
  status: WorkOrderStatus;
  plannedFor: string;
  notes: string;
};

function emptyWorkOrderForm(): WorkOrderForm {
  return {
    type: "REPARATUR",
    providerType: "PARTNERWERKSTATT",
    providerId: "",
    providerName: "",
    description: "",
    costEstimate: "",
    costActual: "",
    status: "GEPLANT",
    plannedFor: "",
    notes: "",
  };
}

function toWorkOrderForm(w: WorkOrder): WorkOrderForm {
  return {
    type: w.type,
    providerType: w.providerType,
    providerId: w.providerId ?? "",
    providerName: w.providerName ?? "",
    description: w.description,
    costEstimate: w.costEstimate?.toString() ?? "",
    costActual: w.costActual?.toString() ?? "",
    status: w.status,
    plannedFor: w.plannedFor ? w.plannedFor.slice(0, 10) : "",
    notes: w.notes ?? "",
  };
}

export default function FahrzeugDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("uebersicht");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [purchaseCreateOpen, setPurchaseCreateOpen] = useState(false);
  const [purchaseCreate, setPurchaseCreate] = useState<{
    sellerId: string;
    channel: PurchaseChannel;
    paymentMethod: PurchasePaymentMethod;
    notes: string;
  }>({ sellerId: "", channel: "TELEFON", paymentMethod: "UEBERWEISUNG", notes: "" });
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm | null>(null);
  const [purchaseLoadedId, setPurchaseLoadedId] = useState<string | null>(null);
  const [items, setItems] = useState<ValuationItem[]>([]);
  const [newItem, setNewItem] = useState<{ kind: ValuationKind; description: string; amount: string }>({
    kind: "REPARATUR",
    description: "",
    amount: "",
  });
  const [pageError, setPageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docKind, setDocKind] = useState<DocumentKind>("SONSTIGES");
  const [docStatus, setDocStatus] = useState<{ kind: "ok" | "error" | "loading"; text: string } | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [docView, setDocView] = useState<{ name: string; url: string; mime: string } | null>(null);
  const [woModalOpen, setWoModalOpen] = useState(false);
  const [woEditing, setWoEditing] = useState<WorkOrder | null>(null);
  const [woForm, setWoForm] = useState<WorkOrderForm>(emptyWorkOrderForm());
  const [providerAddOpen, setProviderAddOpen] = useState(false);
  const [providerForm, setProviderForm] = useState<{ name: string; providerType: ProviderType; phone: string }>({
    name: "",
    providerType: "PARTNERWERKSTATT",
    phone: "",
  });
  // Verkauf: Ausstattungs-Maske, AS24-Link, Tafel-Preis
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentSaved, setEquipmentSaved] = useState(false);
  const [as24Input, setAs24Input] = useState("");
  const [boardPrice, setBoardPrice] = useState("");
  // Verkauf-Abschluss: Verkaufsvorgang, Rechnung, Zahlungen, Mahnwesen
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleForm, setSaleForm] = useState<{
    buyerId: string;
    status: SaleStatus;
    salePrice: string;
    paymentMethod: SalePaymentMethod;
    leasingPartner: string;
    leasingMonthlyRate: string;
    leasingTermMonths: string;
    leasingDownPayment: string;
    tradeInCredit: string;
    tradeInDescription: string;
    soldAt: string;
    notes: string;
  }>({
    buyerId: "",
    status: "INTERESSENT",
    salePrice: "",
    paymentMethod: "UEBERWEISUNG",
    leasingPartner: "",
    leasingMonthlyRate: "",
    leasingTermMonths: "",
    leasingDownPayment: "",
    tradeInCredit: "",
    tradeInDescription: "",
    soldAt: "",
    notes: "",
  });
  const [addonForm, setAddonForm] = useState<{ name: string; provider: string; price: string }>({ name: "", provider: "", price: "" });
  const [invoiceFees, setInvoiceFees] = useState<{ description: string; amount: string }>({ description: "", amount: "" });
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<{ amount: string; method: string; paidAt: string; notes: string; gwgIdentifiedAt: string; gwgIdDocument: string; gwgNotes: string }>({
    amount: "",
    method: "UEBERWEISUNG",
    paidAt: "",
    notes: "",
    gwgIdentifiedAt: "",
    gwgIdDocument: "",
    gwgNotes: "",
  });
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDocId, setEmailDocId] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState<{ to: string; subject: string; message: string }>({ to: "", subject: "", message: "" });
  // Anfragen & Termine
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [inquiryEditing, setInquiryEditing] = useState<Inquiry | null>(null);
  const [inquiryForm, setInquiryForm] = useState<{
    channel: PurchaseChannel;
    contactId: string;
    contactName: string;
    subject: string;
    summary: string;
    nextFollowUpAt: string;
  }>({ channel: "TELEFON", contactId: "", contactName: "", subject: "", summary: "", nextFollowUpAt: "" });
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentEditing, setAppointmentEditing] = useState<Appointment | null>(null);
  const [appointmentForm, setAppointmentForm] = useState<{
    type: AppointmentType;
    title: string;
    startsAt: string;
    endsAt: string;
    contactId: string;
    notes: string;
  }>({ type: "BESICHTIGUNG", title: "", startsAt: "", endsAt: "", contactId: "", notes: "" });

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => api<VehicleDetail>(`/vehicles/${id}`),
    enabled: !!id,
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api<ContactListItem[]>("/contacts"),
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Setting>("/settings"),
  });

  const { data: providers } = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<Provider[]>("/providers"),
  });

  // Formulare mit geladenen Daten füllen (einmal pro Ankaufsvorgang).
  useEffect(() => {
    if (!vehicle) return;
    if (vehicle.purchase && purchaseLoadedId !== vehicle.purchase.id) {
      setPurchaseForm(toPurchaseForm(vehicle.purchase, vehicle.purchase.sellerId));
      setItems(vehicle.purchase.valuationItems);
      setPurchaseLoadedId(vehicle.purchase.id);
    }
    if (!vehicle.purchase && purchaseLoadedId !== "none") {
      setPurchaseForm(null);
      setItems([]);
      setPurchaseLoadedId("none");
    }
  }, [vehicle, purchaseLoadedId]);

  // Verkauf: Ausstattung, AS24-Link und Verkaufsvorgang an die Fahrzeugdaten koppeln.
  useEffect(() => {
    if (!vehicle) return;
    setEquipment(vehicle.equipment ?? []);
    setAs24Input(vehicle.as24Url ?? "");
    const s = vehicle.sale;
    setSaleForm({
      buyerId: s?.buyerId ?? "",
      status: s?.status ?? "INTERESSENT",
      salePrice: s?.salePrice?.toString() ?? vehicle.targetSalePrice?.toString() ?? "",
      paymentMethod: s?.paymentMethod ?? "UEBERWEISUNG",
      leasingPartner: s?.leasingPartner ?? "",
      leasingMonthlyRate: s?.leasingMonthlyRate?.toString() ?? "",
      leasingTermMonths: s?.leasingTermMonths?.toString() ?? "",
      leasingDownPayment: s?.leasingDownPayment?.toString() ?? "",
      tradeInCredit: s?.tradeInCredit?.toString() ?? "",
      tradeInDescription: s?.tradeInDescription ?? "",
      soldAt: s?.soldAt ? s.soldAt.slice(0, 10) : "",
      notes: s?.notes ?? "",
    });
  }, [vehicle?.id]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["vehicle", id] });
    void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: VehicleStatus) =>
      api(`/vehicles/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const saveVehicleMutation = useMutation({
    mutationFn: (body: EditForm) => api<VehicleDetail>(`/vehicles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditOpen(false);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setPageError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024) {
          setPageError(`«${file.name}» ist grösser als 8 MB und wurde übersprungen.`);
          continue;
        }
        const body = new FormData();
        body.append("file", file);
        await api(`/vehicles/${id}/photos`, { method: "POST", body });
      }
      invalidate();
    } catch (err) {
      setPageError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const photoDeleteMutation = useMutation({
    mutationFn: (photoId: string) => api(`/vehicles/${id}/photos/${photoId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const photoOrderMutation = useMutation({
    mutationFn: (ids: string[]) => api(`/vehicles/${id}/photos/order`, { method: "PUT", body: JSON.stringify({ ids }) }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const docUploadMutation = useMutation({
    mutationFn: (payload: { file: File; kind: DocumentKind }) => {
      const body = new FormData();
      body.append("file", payload.file);
      body.append("kind", payload.kind);
      return api(`/vehicles/${id}/documents`, { method: "POST", body });
    },
    onSuccess: async (_doc, payload) => {
      setDocStatus({ kind: "ok", text: `«${payload.file.name}» wurde hochgeladen.` });
      window.setTimeout(() => setDocStatus(null), 4000);
      await invalidate();
    },
    onError: (err: Error) => {
      setDocStatus({ kind: "error", text: `Upload fehlgeschlagen: ${err.message}` });
      setPageError(err.message);
    },
  });

  const docDeleteMutation = useMutation({
    mutationFn: (docId: string) => api(`/vehicles/${id}/documents/${docId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const createPurchaseMutation = useMutation({
    mutationFn: () =>
      api<PurchaseDeal>(`/vehicles/${id}/purchase`, {
        method: "POST",
        body: JSON.stringify({ ...purchaseCreate, sellerId: purchaseCreate.sellerId || undefined }),
      }),
    onSuccess: async () => {
      setPurchaseCreateOpen(false);
      setPurchaseCreate({ sellerId: "", channel: "TELEFON", paymentMethod: "UEBERWEISUNG", notes: "" });
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const savePurchaseMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<PurchaseDeal>(`/purchases/${vehicle?.purchase?.id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => setPageError(err.message),
  });

  // PDF-Erzeugung: erzeugt das Dokument serverseitig und startet den Download.
  function pdfMutation(endpoint: "offer-pdf" | "contract-pdf") {
    return useMutation({
      mutationFn: () => api<GeneratedDocumentInfo>(`/purchases/${vehicle?.purchase?.id}/${endpoint}`, { method: "POST" }),
      onSuccess: (doc) => apiDownload(`/documents/${doc.id}`, `${doc.title}.pdf`),
      onError: (err: Error) => setPageError(err.message),
    });
  }

  const offerPdfMutation = pdfMutation("offer-pdf");
  const contractPdfMutation = pdfMutation("contract-pdf");

  function submitWorkOrder(event: FormEvent) {
    event.preventDefault();
    setPageError(null);
    const body = {
      ...woForm,
      costEstimate: woForm.costEstimate || null,
      costActual: woForm.costActual || null,
      plannedFor: woForm.plannedFor || null,
      providerName: woForm.providerId ? undefined : woForm.providerName || null,
    };
    if (woEditing) {
      updateWorkOrderMutation.mutate({ id: woEditing.id, body });
    } else {
      createWorkOrderMutation.mutate(body);
    }
  }

  const createWorkOrderMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/vehicles/${id}/workorders`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setWoModalOpen(false);
      setWoEditing(null);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const updateWorkOrderMutation = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      api(`/workorders/${payload.id}`, { method: "PUT", body: JSON.stringify(payload.body) }),
    onSuccess: () => {
      setWoModalOpen(false);
      setWoEditing(null);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteWorkOrderMutation = useMutation({
    mutationFn: (workOrderId: string) => api(`/workorders/${workOrderId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const createProviderMutation = useMutation({
    mutationFn: () => api("/providers", { method: "POST", body: JSON.stringify(providerForm) }),
    onSuccess: () => {
      setProviderAddOpen(false);
      setProviderForm({ name: "", providerType: "PARTNERWERKSTATT", phone: "" });
      void queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteProviderMutation = useMutation({
    mutationFn: (providerId: string) => api(`/providers/${providerId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["providers"] }),
    onError: (err: Error) => setPageError(err.message),
  });

  const saveEquipmentMutation = useMutation({
    mutationFn: () => api(`/vehicles/${id}`, { method: "PUT", body: JSON.stringify({ equipment }) }),
    onSuccess: () => {
      setEquipmentSaved(true);
      window.setTimeout(() => setEquipmentSaved(false), 2500);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const saveAs24Mutation = useMutation({
    mutationFn: () => api(`/vehicles/${id}`, { method: "PUT", body: JSON.stringify({ as24Url: as24Input }) }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const boardPdfMutation = useMutation({
    mutationFn: () =>
      api<GeneratedDocumentInfo>(`/vehicles/${id}/board-pdf`, {
        method: "POST",
        body: JSON.stringify({ price: boardPrice || null }),
      }),
    onSuccess: (doc) => apiDownload(`/documents/${doc.id}`, `${doc.title}.pdf`),
    onError: (err: Error) => setPageError(err.message),
  });

  // ── Verkauf-Abschluss (Phase E) ──────────────────────────────────────────

  const saleNum = (v: string): number | null => (v === "" ? null : Number(v));

  function saleBody(): Record<string, unknown> {
    return {
      buyerId: saleForm.buyerId || null,
      status: saleForm.status,
      salePrice: saleNum(saleForm.salePrice),
      paymentMethod: saleForm.paymentMethod,
      leasingPartner: saleForm.leasingPartner || null,
      leasingMonthlyRate: saleNum(saleForm.leasingMonthlyRate),
      leasingTermMonths: saleNum(saleForm.leasingTermMonths),
      leasingDownPayment: saleNum(saleForm.leasingDownPayment),
      tradeInCredit: saleNum(saleForm.tradeInCredit),
      tradeInDescription: saleForm.tradeInDescription || null,
      soldAt: saleForm.soldAt || null,
      notes: saleForm.notes || null,
    };
  }

  const saveSaleMutation = useMutation({
    mutationFn: () => api(`/vehicles/${id}/sale`, { method: "PUT", body: JSON.stringify(saleBody()) }),
    onSuccess: () => {
      setSaleModalOpen(false);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  function vehicleDocMutation(endpoint: string) {
    return useMutation({
      mutationFn: () => api<GeneratedDocumentInfo>(`/vehicles/${id}/${endpoint}`, { method: "POST" }),
      onSuccess: (doc) => apiDownload(`/documents/${doc.id}`, `${doc.title}.pdf`),
      onError: (err: Error) => setPageError(err.message),
    });
  }

  const kaufvertragMutation = vehicleDocMutation("kaufvertrag-pdf");
  const leasingDossierMutation = vehicleDocMutation("leasing-dossier-pdf");
  const zusammenfassungMutation = vehicleDocMutation("zusammenfassung-pdf");

  const addAddonMutation = useMutation({
    mutationFn: () =>
      api(`/vehicles/${id}/addons`, {
        method: "POST",
        body: JSON.stringify({ name: addonForm.name, provider: addonForm.provider || null, price: saleNum(addonForm.price) }),
      }),
    onSuccess: () => {
      setAddonForm({ name: "", provider: "", price: "" });
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteAddonMutation = useMutation({
    mutationFn: (addonId: string) => api(`/sale-addons/${addonId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const invoiceMutation = useMutation({
    mutationFn: () => {
      const fees =
        invoiceFees.description && invoiceFees.amount
          ? [{ description: invoiceFees.description, amount: Number(invoiceFees.amount) }]
          : [];
      return api<{ invoice: { id: string; number: string }; documentId: string }>(`/vehicles/${id}/invoice`, {
        method: "POST",
        body: JSON.stringify({ fees, notes: null }),
      });
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => setPageError(err.message),
  });

  const paymentMutation = useMutation({
    mutationFn: () =>
      api("/payments", {
        method: "POST",
        body: JSON.stringify({
          saleDealId: vehicle?.sale?.id ?? null,
          amount: Number(paymentForm.amount),
          method: paymentForm.method,
          paidAt: paymentForm.paidAt || null,
          notes: paymentForm.notes || null,
          gwgIdentifiedAt: paymentForm.gwgIdentifiedAt || null,
          gwgIdDocument: paymentForm.gwgIdDocument || null,
          gwgNotes: paymentForm.gwgNotes || null,
        }),
      }),
    onSuccess: () => {
      setPaymentModalOpen(false);
      setPaymentForm({ amount: "", method: "UEBERWEISUNG", paidAt: "", notes: "", gwgIdentifiedAt: "", gwgIdDocument: "", gwgNotes: "" });
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => api(`/payments/${paymentId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const reminderMutation = useMutation({
    mutationFn: (payload: { invoiceId: string; level: number }) =>
      api<{ invoice: unknown; documentId: string }>(`/invoices/${payload.invoiceId}/reminder`, {
        method: "POST",
        body: JSON.stringify({ level: payload.level }),
      }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => setPageError(err.message),
  });

  const creditNoteMutation = useMutation({
    mutationFn: (payload: { invoiceId: string; reason: string }) =>
      api(`/invoices/${payload.invoiceId}/credit-note`, { method: "POST", body: JSON.stringify({ reason: payload.reason }) }),
    onSuccess: () => invalidate(),
    onError: (err: Error) => setPageError(err.message),
  });

  const emailDocMutation = useMutation({
    mutationFn: () =>
      api(`/documents/${emailDocId}/email`, {
        method: "POST",
        body: JSON.stringify({ to: emailForm.to, subject: emailForm.subject || null, message: emailForm.message || null }),
      }),
    onSuccess: () => {
      setEmailModalOpen(false);
      setEmailForm({ to: "", subject: "", message: "" });
      setPageError(null);
    },
    onError: (err: Error) => setPageError(err.message),
  });

  function submitInquiry(event: FormEvent) {
    event.preventDefault();
    setPageError(null);
    const body = {
      channel: inquiryForm.channel,
      contactId: inquiryForm.contactId || null,
      contactName: inquiryForm.contactId ? null : inquiryForm.contactName || null,
      subject: inquiryForm.subject || null,
      summary: inquiryForm.summary || null,
      nextFollowUpAt: inquiryForm.nextFollowUpAt || null,
    };
    if (inquiryEditing) {
      updateInquiryMutation.mutate({ id: inquiryEditing.id, body });
    } else {
      createInquiryMutation.mutate(body);
    }
  }

  const createInquiryMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/vehicles/${id}/inquiries`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setInquiryModalOpen(false);
      setInquiryEditing(null);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const updateInquiryMutation = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      api(`/inquiries/${payload.id}`, { method: "PUT", body: JSON.stringify(payload.body) }),
    onSuccess: () => {
      setInquiryModalOpen(false);
      setInquiryEditing(null);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteInquiryMutation = useMutation({
    mutationFn: (inquiryId: string) => api(`/inquiries/${inquiryId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  function submitAppointment(event: FormEvent) {
    event.preventDefault();
    setPageError(null);
    const body = {
      vehicleId: id,
      type: appointmentForm.type,
      title: appointmentForm.title,
      startsAt: appointmentForm.startsAt,
      endsAt: appointmentForm.endsAt || null,
      contactId: appointmentForm.contactId || null,
      notes: appointmentForm.notes || null,
    };
    if (appointmentEditing) {
      updateAppointmentMutation.mutate({ id: appointmentEditing.id, body });
    } else {
      createAppointmentMutation.mutate(body);
    }
  }

  const createAppointmentMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/appointments`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setAppointmentModalOpen(false);
      setAppointmentEditing(null);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: (payload: { id: string; body: Record<string, unknown> }) =>
      api(`/appointments/${payload.id}`, { method: "PUT", body: JSON.stringify(payload.body) }),
    onSuccess: () => {
      setAppointmentModalOpen(false);
      setAppointmentEditing(null);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: (appointmentId: string) => api(`/appointments/${appointmentId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const [listingCopied, setListingCopied] = useState(false);

  function copyListing() {
    if (!vehicle) return;
    const lines = [
      `${vehicle.make} ${vehicle.model}${vehicle.variant ? ` ${vehicle.variant}` : ""}`,
      `Erste Inverkehrtsetzung: ${formatDate(vehicle.firstRegistration)} · ${vehicle.mileageKm?.toLocaleString("de-CH") ?? "?"} km`,
      [vehicle.fuel, vehicle.transmission, vehicle.color].filter(Boolean).join(" · "),
      vehicle.hasServiceBook ? "Scheckheft gepflegt" : "",
      "",
      vehicle.description ?? "",
      "",
      vehicle.equipment.length ? `Ausstattung:\n${vehicle.equipment.map((e) => `• ${e}`).join("\n")}` : "",
      "",
      `Preis: ${chf(vehicle.targetSalePrice)}`,
    ];
    void navigator.clipboard.writeText(lines.filter(Boolean).join("\n"));
    setListingCopied(true);
    window.setTimeout(() => setListingCopied(false), 2000);
  }

  // Live-Kalkulation (Spiegel der Server-Logik).
  const calc = useMemo(() => {
    const form = purchaseForm;
    const costs = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const estimated = form?.estimatedSalePrice ? Number(form.estimatedSalePrice) : null;
    const target = form?.targetProfit ? Number(form.targetProfit) : (settings?.targetProfitDefault ?? 0);
    const purchasePrice = form?.purchasePrice ? Number(form.purchasePrice) : null;
    const recommendation = estimated != null ? Math.max(0, Math.round(estimated - costs - target)) : null;
    const profit = estimated != null ? Math.round(estimated - costs - (purchasePrice ?? 0)) : null;
    return { costs, estimated, recommendation, profit, purchasePrice };
  }, [purchaseForm, items, settings]);

  // Ist-Kosten aus den Aufträgen (Phase C) für den Soll/Ist-Vergleich.
  const woIst = (vehicle?.workOrders ?? []).reduce((sum, w) => sum + (w.costActual ?? 0), 0);

  if (isLoading) {
    return (
      <div className="py-16">
        <Spinner label="Fahrzeug wird geladen …" />
      </div>
    );
  }
  if (!vehicle) {
    return <Alert>Fahrzeug nicht gefunden.</Alert>;
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editForm) return;
    setPageError(null);
    saveVehicleMutation.mutate(editForm);
  }

  function submitPurchase(event: FormEvent) {
    event.preventDefault();
    if (!purchaseForm) return;
    setPageError(null);
    savePurchaseMutation.mutate({ ...purchaseForm, valuationItems: items });
  }

  function submitCreatePurchase(event: FormEvent) {
    event.preventDefault();
    setPageError(null);
    createPurchaseMutation.mutate();
  }

  const photoIds = vehicle.photos.map((p) => p.id);

  return (
    <div className="space-y-6">
      {/* Kopf */}
      <div>
        <Link to="/fahrzeuge" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft size={14} /> Fahrzeuge
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {vehicle.make} {vehicle.model}
              {vehicle.variant ? <span className="font-medium text-slate-500"> · {vehicle.variant}</span> : null}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {vehicle.plates ? <span>{vehicle.plates}</span> : null}
              <span>{formatDate(vehicle.firstRegistration)}</span>
              <span>{vehicle.mileageKm?.toLocaleString("de-CH") ?? "–"} km</span>
              <span>{vehicle.fuel ?? "–"}</span>
              <span>{vehicle.transmission ?? "–"}</span>
              <span>
                {vehicle.daysInStatus} Tage im Status «{VEHICLE_STATUS_LABELS[vehicle.status]}»
              </span>
              {vehicle.as24Url ? (
                <a href={vehicle.as24Url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  AutoScout24 <ExternalLink size={12} />
                </a>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={vehicle.status}
              onChange={(e) => statusMutation.mutate(e.target.value as VehicleStatus)}
              className="w-48"
              aria-label="Status ändern"
            >
              {VEHICLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {VEHICLE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
            <Badge className={VEHICLE_STATUS_STYLES[vehicle.status]}>{VEHICLE_STATUS_LABELS[vehicle.status]}</Badge>
          </div>
        </div>
      </div>

      {pageError ? <Alert>{pageError}</Alert> : null}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Übersicht ─────────────────────────────────────────────────── */}
      {tab === "uebersicht" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Fotos"
              description="Reihenfolge: erste Aufnahme = Titelbild (später auch für Exposé und Tafel)."
              actions={
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">
                  <Upload size={14} />
                  {uploading ? "Lädt hoch …" : "Fotos hochladen"}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadPhotos(e.target.files)} />
                </label>
              }
            />
            <div className="px-5 py-4">
              {vehicle.photos.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">Noch keine Fotos. JPG/PNG/WebP bis 8 MB.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {vehicle.photos.map((photo, index) => (
                    <div key={photo.id} className="group relative">
                      <img
                        src={`/uploads/photos/${photo.filename}`}
                        alt={photo.originalName ?? "Fahrzeugfoto"}
                        className="aspect-square w-full rounded-xl object-cover ring-1 ring-slate-200"
                      />
                      <div className="absolute inset-x-1 bottom-1 flex items-center justify-between rounded-lg bg-slate-950/60 px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="Nach links"
                          disabled={index === 0}
                          onClick={() => {
                            const ids = [...photoIds];
                            [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                            photoOrderMutation.mutate(ids);
                          }}
                          className="rounded p-1 text-white disabled:opacity-30 hover:bg-white/20"
                        >
                          <ArrowLeftSquare size={14} />
                        </button>
                        <span className="text-[10px] font-semibold text-white">{index + 1}</span>
                        <button
                          type="button"
                          title="Nach rechts"
                          disabled={index === vehicle.photos.length - 1}
                          onClick={() => {
                            const ids = [...photoIds];
                            [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                            photoOrderMutation.mutate(ids);
                          }}
                          className="rounded p-1 text-white disabled:opacity-30 hover:bg-white/20"
                        >
                          <ArrowRightSquare size={14} />
                        </button>
                        <button
                          type="button"
                          title="Löschen"
                          onClick={() => photoDeleteMutation.mutate(photo.id)}
                          className="rounded p-1 text-rose-200 hover:bg-white/20"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Verwaltungs-Dokumente"
              description="Fahrzeugausweis, Serviceheft, Zustandsberichte — nur für das Team (nicht öffentlich)."
              actions={
                <div className="flex items-center gap-2">
                  <Select value={docKind} onChange={(e) => setDocKind(e.target.value as DocumentKind)} className="w-44" aria-label="Dokument-Typ">
                    {DOCUMENT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {DOCUMENT_KIND_LABELS[k]}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                  >
                    <Upload size={14} /> {docStatus?.kind === "loading" ? "Lädt hoch …" : "Dokument hochladen"}
                  </button>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (file.size > 8 * 1024 * 1024) {
                        setDocStatus({ kind: "error", text: "Datei zu gross — max. 8 MB pro Dokument." });
                        return;
                      }
                      setDocStatus({ kind: "loading", text: "" });
                      docUploadMutation.mutate({ file, kind: docKind });
                    }}
                  />
                </div>
              }
            />
            {docStatus ? (
              <div
                className={`mx-5 mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
                  docStatus.kind === "ok"
                    ? "bg-emerald-50 text-emerald-700"
                    : docStatus.kind === "error"
                      ? "bg-rose-50 text-rose-700"
                      : "bg-slate-50 text-slate-600"
                }`}
              >
                {docStatus.text || "Upload läuft …"}
              </div>
            ) : null}
            <div className="divide-y divide-slate-100 px-5 py-2">
              {vehicle.documents.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">Noch keine Dokumente (JPG oder PDF, max. 8 MB).</p>
              ) : (
                vehicle.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{DOCUMENT_KIND_LABELS[doc.kind]}</Badge>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const blob = await apiBlob(`/vehicles/${id}/documents/${doc.id}?inline=1`);
                              setDocView({
                                name: doc.originalName ?? doc.filename,
                                url: URL.createObjectURL(blob),
                                mime: blob.type,
                              });
                            } catch (err) {
                              setPageError((err as Error).message);
                            }
                          }}
                          title="Dokument ansehen"
                          className="truncate text-sm font-medium text-slate-800 hover:text-amber-700 hover:underline"
                        >
                          {doc.originalName ?? doc.filename}
                        </button>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(doc.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Herunterladen"
                        onClick={() => apiDownload(`/vehicles/${id}/documents/${doc.id}`, doc.originalName ?? doc.filename)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        type="button"
                        title="Löschen"
                        onClick={() => docDeleteMutation.mutate(doc.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Fahrzeugdaten"
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditForm(toEditForm(vehicle));
                    setEditOpen(true);
                  }}
                >
                  Bearbeiten
                </Button>
              }
            />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stammnummer</dt>
                <dd className="text-slate-800">{vehicle.chassisNumber ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">MFK bis</dt>
                <dd className="text-slate-800">{formatDate(vehicle.mfkUntil)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serviceheft</dt>
                <dd className="text-slate-800">{vehicle.hasServiceBook ? "Vorhanden" : "Nicht vorhanden"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Farbe</dt>
                <dd className="text-slate-800">{vehicle.color ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zielverkaufspreis</dt>
                <dd className="text-slate-800">{chf(vehicle.targetSalePrice)}</dd>
              </div>
            </dl>
            {vehicle.description ? (
              <p className="whitespace-pre-line border-t border-slate-100 px-5 py-4 text-sm text-slate-600">{vehicle.description}</p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {/* ── Ankauf ────────────────────────────────────────────────────── */}
      {tab === "ankauf" ? (
        vehicle.purchase ? (
          <form onSubmit={submitPurchase} className="space-y-6">
            <Card>
              <CardHeader
                title="Kalkulation"
                description="Zielverkaufspreis (AutoScout24-Vergleich) minus erwartete Kosten minus Zielgewinn = Ankaufs-Empfehlung."
              />
              <div className="space-y-4 px-5 py-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Zielverkaufspreis (CHF)" hint="Vergleichspreis ähnlicher Fahrzeuge">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={purchaseForm?.estimatedSalePrice ?? ""}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, estimatedSalePrice: e.target.value })}
                    />
                  </Field>
                  <Field label="Zielgewinn (CHF)" hint="Leer = Standard aus Einstellungen">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={purchaseForm?.targetProfit ?? ""}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, targetProfit: e.target.value })}
                    />
                  </Field>
                  <Field label="Ankaufspreis (CHF)" hint="Effektiv ausgehandelt">
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={purchaseForm?.purchasePrice ?? ""}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, purchasePrice: e.target.value })}
                    />
                  </Field>
                </div>

                {/* Kalkulationspositionen */}
                <div className="rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Erwartete Kosten ({chf(calc.costs)})
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-2 px-4 py-2">
                        <Select
                          value={item.kind}
                          onChange={(e) => {
                            const next = [...items];
                            next[index] = { ...item, kind: e.target.value as ValuationKind };
                            setItems(next);
                          }}
                          className="w-40"
                        >
                          {VALUATION_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {VALUATION_KIND_LABELS[k]}
                            </option>
                          ))}
                        </Select>
                        <Input
                          value={item.description}
                          onChange={(e) => {
                            const next = [...items];
                            next[index] = { ...item, description: e.target.value };
                            setItems(next);
                          }}
                          placeholder="Beschreibung"
                        />
                        <Input
                          type="number"
                          min={0}
                          step={10}
                          value={item.amount}
                          onChange={(e) => {
                            const next = [...items];
                            next[index] = { ...item, amount: Number(e.target.value) || 0 };
                            setItems(next);
                          }}
                          className="w-28 text-right"
                        />
                        <button
                          type="button"
                          title="Position entfernen"
                          onClick={() => setItems(items.filter((_, i) => i !== index))}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    {items.length === 0 ? <p className="px-4 py-3 text-xs text-slate-500">Noch keine Kostenpositionen.</p> : null}
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <Select
                        value={newItem.kind}
                        onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as ValuationKind })}
                        className="w-40"
                      >
                        {VALUATION_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {VALUATION_KIND_LABELS[k]}
                          </option>
                        ))}
                      </Select>
                      <Input
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        placeholder="Neue Position …"
                      />
                      <Input
                        type="number"
                        min={0}
                        step={10}
                        value={newItem.amount}
                        onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })}
                        className="w-28 text-right"
                        placeholder="CHF"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!newItem.description.trim() || !newItem.amount}
                        onClick={() => {
                          setItems([
                            ...items,
                            {
                              id: `new-${Date.now()}`,
                              kind: newItem.kind,
                              description: newItem.description.trim(),
                              amount: Number(newItem.amount) || 0,
                            },
                          ]);
                          setNewItem({ kind: "REPARATUR", description: "", amount: "" });
                        }}
                      >
                        <Plus size={14} />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Ergebnis */}
                <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ankaufs-Empfehlung</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{calc.recommendation != null ? chf(calc.recommendation) : "–"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erwarteter Gewinn</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{calc.profit != null ? chf(calc.profit) : "–"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erwartete Kosten total</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{chf(calc.costs)}</p>
                  </div>
                </div>
                {woIst > 0 ? (
                  <p className="text-xs text-slate-500">
                    Ist-Kosten laut Aufträgen: <strong className="text-slate-700">{chf(woIst)}</strong>
                    {calc.estimated != null && calc.purchasePrice != null ? (
                      <>
                        {" · "}
                        Gewinn mit Ist-Kosten: <strong className="text-slate-700">{chf(calc.estimated - woIst - calc.purchasePrice)}</strong>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {purchaseForm?.paymentMethod === "EINTAUSCH" ? (
                  <Alert kind="info">
                    <span className="inline-flex items-start gap-2">
                      <Info size={14} className="mt-0.5 shrink-0" />
                      Eintausch: kein separates Angebots-PDF. Der Marktwert ist massgebend, der Ankaufspreis erscheint als
                      Abzugsposten auf der Verkaufsrechnung (MWST-Nachweis gem. Art. 38 MWSTG).
                    </span>
                  </Alert>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader title="Ankaufsvorgang" description="Status, Verkäufer, Zahlung — Befunde fliessen automatisch in die Pipeline." />
              <div className="space-y-4 px-5 py-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Field label="Status">
                    <Select
                      value={purchaseForm?.status ?? "LEAD"}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, status: e.target.value as PurchaseStatus })}
                    >
                      {PURCHASE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PURCHASE_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Kanal">
                    <Select
                      value={purchaseForm?.channel ?? "TELEFON"}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, channel: e.target.value as PurchaseChannel })}
                    >
                      {PURCHASE_CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {PURCHASE_CHANNEL_LABELS[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Verkäufer">
                    <Select
                      value={purchaseForm?.sellerId ?? ""}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, sellerId: e.target.value })}
                    >
                      <option value="">– ohne Verkäufer –</option>
                      {(contacts ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Zahlungsart">
                    <Select
                      value={purchaseForm?.paymentMethod ?? "UEBERWEISUNG"}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, paymentMethod: e.target.value as PurchasePaymentMethod })}
                    >
                      {(Object.keys(PURCHASE_PAYMENT_LABELS) as PurchasePaymentMethod[]).map((m) => (
                        <option key={m} value={m}>
                          {PURCHASE_PAYMENT_LABELS[m]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Kaufdatum">
                    <Input
                      type="date"
                      value={purchaseForm?.purchasedAt ?? ""}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, purchasedAt: e.target.value })}
                    />
                  </Field>
                  <Field label="Auszahlung bis">
                    <Input
                      type="date"
                      value={purchaseForm?.paymentDueDate ?? ""}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm!, paymentDueDate: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Notizen">
                  <textarea
                    rows={3}
                    value={purchaseForm?.notes ?? ""}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm!, notes: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savePurchaseMutation.isPending}>
                    <Save size={15} /> {savePurchaseMutation.isPending ? "Speichern …" : "Kalkulation speichern"}
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Dokumente zum Ankauf"
                description="Ankaufsangebot (nur der Ankaufspreis) und Ankaufsvertrag (MWST-Beleg: Typ, Stammnummer, Datum, Verkäufer-Adresse)."
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={offerPdfMutation.isPending || purchaseForm?.paymentMethod === "EINTAUSCH" || !purchaseForm?.purchasePrice}
                      title={
                        purchaseForm?.paymentMethod === "EINTAUSCH"
                          ? "Bei Eintausch entfällt das separate Ankaufsangebot"
                          : !purchaseForm?.purchasePrice
                            ? "Erst einen Ankaufspreis erfassen"
                            : "Ankaufsangebot als PDF erstellen"
                      }
                      onClick={() => offerPdfMutation.mutate()}
                    >
                      <FileText size={14} /> {offerPdfMutation.isPending ? "Erstellt …" : "Angebot als PDF"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={contractPdfMutation.isPending || !purchaseForm?.purchasePrice}
                      title={!purchaseForm?.purchasePrice ? "Erst einen Ankaufspreis erfassen" : "Ankaufsvertrag als PDF erstellen"}
                      onClick={() => contractPdfMutation.mutate()}
                    >
                      <FileText size={14} /> {contractPdfMutation.isPending ? "Erstellt …" : "Ankaufsvertrag als PDF"}
                    </Button>
                  </div>
                }
              />
              <div className="divide-y divide-slate-100 px-5 py-2">
                {(vehicle.generatedDocuments ?? [])
                  .filter((d) => d.documentType === "ANKAUF_ANGEBOT" || d.documentType === "ANKAUF_VERTRAG")
                  .map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{GENERATED_DOC_LABELS[d.documentType]}</Badge>
                        <span className="truncate text-sm text-slate-700">{d.title}</span>
                        <span className="text-[11px] text-slate-400">{formatDate(d.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="PDF herunterladen"
                          onClick={() => apiDownload(`/documents/${d.id}`, `${d.title}.pdf`)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Download size={15} />
                        </button>
                        <button
                          type="button"
                          title="PDF per E-Mail versenden"
                          onClick={() => {
                            setEmailDocId(d.id);
                            setEmailForm({ to: "", subject: d.title, message: "" });
                            setEmailModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Mail size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                {(vehicle.generatedDocuments ?? []).filter((d) => d.documentType === "ANKAUF_ANGEBOT" || d.documentType === "ANKAUF_VERTRAG")
                  .length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">
                    Noch keine Dokumente erstellt. Sobald ein Ankaufspreis steht, kannst du Angebot und Vertrag als PDF erzeugen.
                  </p>
                ) : null}
              </div>
            </Card>
          </form>
        ) : (
          <Card>
            <CardHeader title="Ankauf" description="Noch kein Ankaufsvorgang erfasst." />
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-600">
                Lege den Ankaufsvorgang an, um Kalkulation, Ankaufs-Empfehlung und Gewinn zu erfassen.
              </p>
              <Button className="mt-4" onClick={() => setPurchaseCreateOpen(true)}>
                <Plus size={15} /> Ankaufsvorgang anlegen
              </Button>
            </div>
          </Card>
        )
      ) : null}

      {tab === "auftraege" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Aufträge"
              description="Reparatur, Service, MFK und Aufbereitung — intern, bei der Marken- oder Partnerwerkstatt oder extern."
              actions={
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    Soll <strong className="text-slate-700">{chf((vehicle.workOrders ?? []).reduce((s, w) => s + (w.costEstimate ?? 0), 0))}</strong>
                    {" · "}
                    Ist <strong className="text-slate-700">{chf(woIst)}</strong>
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      setWoForm(emptyWorkOrderForm());
                      setWoEditing(null);
                      setWoModalOpen(true);
                    }}
                  >
                    <Plus size={14} /> Auftrag anlegen
                  </Button>
                </div>
              }
            />
            <div className="divide-y divide-slate-100">
              {(vehicle.workOrders ?? []).length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  Noch keine Aufträge. Beim Abschluss des Ankaufs werden die Kalkulationspositionen automatisch als geplante
                  Aufträge übernommen — oder lege hier direkt einen an.
                </p>
              ) : (
                (vehicle.workOrders ?? []).map((w) => (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{WORK_ORDER_TYPE_LABELS[w.type]}</Badge>
                        <Badge className="bg-slate-50 text-slate-500 ring-slate-200">{PROVIDER_TYPE_LABELS[w.providerType]}</Badge>
                        <Badge className={WORK_ORDER_STATUS_STYLES[w.status]}>{WORK_ORDER_STATUS_LABELS[w.status]}</Badge>
                        <span className="text-[11px] text-slate-400">
                          {w.plannedFor ? `geplant: ${formatDate(w.plannedFor)}` : null}
                          {w.completedAt ? ` · fertig: ${formatDate(w.completedAt)}` : null}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-800">{w.description}</p>
                      <p className="text-xs text-slate-500">
                        {w.provider?.name ?? w.providerName ?? "ohne fixen Anbieter"}
                        {w.costEstimate != null ? ` · Soll ${chf(w.costEstimate)}` : ""}
                        {w.costActual != null ? ` · Ist ${chf(w.costActual)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={w.status}
                        className="w-36"
                        aria-label="Auftragsstatus"
                        onChange={(e) =>
                          updateWorkOrderMutation.mutate({ id: w.id, body: { status: e.target.value as WorkOrderStatus } })
                        }
                      >
                        {WORK_ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {WORK_ORDER_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        title="Bearbeiten"
                        onClick={() => {
                          setWoForm(toWorkOrderForm(w));
                          setWoEditing(w);
                          setWoModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title="Löschen"
                        onClick={() => deleteWorkOrderMutation.mutate(w.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Anbieter"
              description="Partnerwerkstätten, Markenwerkstatt, Aufbereiter und externe Spezialisten."
              actions={
                <Button size="sm" variant="secondary" onClick={() => setProviderAddOpen(true)}>
                  <Plus size={14} /> Anbieter
                </Button>
              }
            />
            <div className="divide-y divide-slate-100 px-5">
              {(providers ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">Noch keine Anbieter erfasst.</p>
              ) : (
                (providers ?? []).map((pv) => (
                  <div key={pv.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{PROVIDER_TYPE_LABELS[pv.providerType]}</Badge>
                      <span className="truncate text-sm text-slate-800">{pv.name}</span>
                      {pv.phone ? <span className="text-xs text-slate-500">{pv.phone}</span> : null}
                    </div>
                    <button
                      type="button"
                      title="Löschen"
                      onClick={() => deleteProviderMutation.mutate(pv.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}
      {tab === "verkauf" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="AutoScout24-Vorbereitung"
              description="Daten, Beschreibung und Ausstattung kopierfertig fürs Händlerportal — das Einstellen bleibt manuell."
              actions={
                <Button size="sm" variant="secondary" onClick={copyListing}>
                  <ClipboardCopy size={14} /> {listingCopied ? "Kopiert!" : "Inserat-Text kopieren"}
                </Button>
              }
            />
            <div className="space-y-4 px-5 py-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {[
                  ["Titel", `${vehicle.make} ${vehicle.model}${vehicle.variant ? ` ${vehicle.variant}` : ""}`],
                  ["Erste Inverkehrtsetzung", formatDate(vehicle.firstRegistration)],
                  ["Kilometer", vehicle.mileageKm?.toLocaleString("de-CH") ?? "–"],
                  ["Treibstoff / Getriebe", [vehicle.fuel, vehicle.transmission].filter(Boolean).join(" / ") || "–"],
                  ["Farbe", vehicle.color ?? "–"],
                  ["MFK bis", formatDate(vehicle.mfkUntil)],
                  ["Scheckheft", vehicle.hasServiceBook ? "Ja" : "Nein"],
                  ["Preis", chf(vehicle.targetSalePrice)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              {vehicle.description ? (
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="whitespace-pre-line text-sm text-slate-700">{vehicle.description}</p>
                </div>
              ) : (
                <Alert kind="info">Noch keine Beschreibung — erst im Tab «Übersicht» → Fahrzeugdaten bearbeiten erfassen.</Alert>
              )}

              {/* Ausstattungs-Maske */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sonderausstattungen (für Tafel & Exposé)</p>
                  <Button size="sm" variant="secondary" onClick={() => saveEquipmentMutation.mutate()} disabled={saveEquipmentMutation.isPending}>
                    <Save size={13} /> {equipmentSaved ? "Gespeichert" : "Ausstattung speichern"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {EQUIPMENT_CATALOG.map((item) => (
                    <label key={item} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={equipment.includes(item)}
                        onChange={(e) =>
                          setEquipment(e.target.checked ? [...equipment, item] : equipment.filter((x) => x !== item))
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      {item}
                    </label>
                  ))}
                </div>
                {equipment.length ? (
                  <p className="mt-2 text-[11px] text-slate-500">Gewählt: {equipment.length} — erscheinen auf der A3-Tafel und im Inserat-Text.</p>
                ) : null}
              </div>

              {/* Link-Verwaltung */}
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Link2 size={13} /> Inserat-Link
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={as24Input}
                    onChange={(e) => setAs24Input(e.target.value)}
                    placeholder="https://www.autoscout24.ch/de/d/…"
                    className="w-full sm:max-w-md"
                  />
                  <Button size="sm" variant="secondary" onClick={() => saveAs24Mutation.mutate()} disabled={saveAs24Mutation.isPending}>
                    Link speichern
                  </Button>
                  {vehicle.as24Url ? (
                    <a
                      href={vehicle.as24Url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      Inserat öffnen <ExternalLink size={13} />
                    </a>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Der Link speist den QR-Code auf der A3-Tafel. Händlerportal:{" "}
                  {settings?.as24PortalUrl ? (
                    <a href={settings.as24PortalUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      AutoScout24 Manager öffnen <ExternalLink size={11} className="inline" />
                    </a>
                  ) : (
                    <span>URL in den Einstellungen hinterlegen</span>
                  )}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="A3-Tafel für die Windschutzscheibe"
              description="Immer gleiches Schema: Firma, Preis, Fahrzeugdaten, Beschreibung, Ausstattung und QR-Code zum Inserat."
              actions={
                <Button size="sm" onClick={() => boardPdfMutation.mutate()} disabled={boardPdfMutation.isPending}>
                  <QrCode size={14} /> {boardPdfMutation.isPending ? "Erstellt …" : "Tafel als PDF"}
                </Button>
              }
            />
            <div className="flex flex-wrap items-end gap-3 px-5 py-4">
              <Field label="Preis auf der Tafel" hint="Leer = Zielverkaufspreis">
                <Input type="number" min={0} step={100} value={boardPrice} onChange={(e) => setBoardPrice(e.target.value)} className="w-44" />
              </Field>
              <p className="max-w-md pb-1 text-xs text-slate-500">
                {vehicle.as24Url
                  ? "QR-Code wird auf den Inserat-Link gerichtet."
                  : "Ohne Inserat-Link erscheint keine QR-Code-Ecke — Link oben speichern, dann Tafel erzeugen."}
                {" A3 quer, druckfertig."}
              </p>
            </div>
          </Card>

          {/* ── Abschluss: Verkaufsvorgang, Zusatzleistungen, Rechnung, Zahlungen ── */}
          <Card>
            <CardHeader
              title="Abschluss"
              description="Verkaufsvorgang erfassen, dann Kaufvertrag, QR-Rechnung, Zahlungen und Zusammenfassungs-PDF."
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSaleModalOpen(true)}>
                    <Pencil size={14} /> Verkaufsvorgang {vehicle.sale ? "bearbeiten" : "erfassen"}
                  </Button>
                </div>
              }
            />
            {!vehicle.sale ? (
              <div className="px-5 py-4">
                <Alert kind="info">Noch kein Verkaufsvorgang — zuerst erfassen (Käufer, Preis, Zahlungsart), dann vertragsfähig.</Alert>
              </div>
            ) : (
              <div className="space-y-5 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={`${SALE_STATUS_STYLES[vehicle.sale.status]} ring-slate-200`}>{SALE_STATUS_LABELS[vehicle.sale.status]}</Badge>
                  <span className="text-sm font-semibold text-slate-800">
                    {vehicle.sale.buyerName ?? "Käufer offen"} · {chf(vehicle.sale.salePrice)} · {SALE_PAYMENT_LABELS[vehicle.sale.paymentMethod]}
                  </span>
                  {vehicle.sale.soldAt ? <span className="text-xs text-slate-500">Verkauft am {formatDate(vehicle.sale.soldAt)}</span> : null}
                  {vehicle.sale.tradeInCredit ? (
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200">
                      Eintausch-Abzug {chf(vehicle.sale.tradeInCredit)}{vehicle.sale.tradeInDescription ? ` · ${vehicle.sale.tradeInDescription}` : ""}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => kaufvertragMutation.mutate()} disabled={kaufvertragMutation.isPending || !vehicle.sale.salePrice || !vehicle.sale.buyerId}>
                    <FileText size={14} /> {kaufvertragMutation.isPending ? "Erstellt …" : "Kaufvertrag als PDF"}
                  </Button>
                  {vehicle.sale.paymentMethod === "LEASING" ? (
                    <Button size="sm" variant="secondary" onClick={() => leasingDossierMutation.mutate()} disabled={leasingDossierMutation.isPending}>
                      <FileText size={14} /> Leasing-Dossier
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => zusammenfassungMutation.mutate()} disabled={zusammenfassungMutation.isPending}>
                    <Download size={14} /> Zusammenfassungs-PDF (Archiv)
                  </Button>
                </div>
                {!vehicle.sale.buyerId || !vehicle.sale.salePrice ? (
                  <p className="text-xs text-slate-500">Für den Kaufvertrag bitte Käufer und Verkaufspreis im Verkaufsvorgang erfassen.</p>
                ) : null}

                {/* Zusatzleistungen */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Zusatzleistungen (fliessen in Kaufvertrag & Rechnung)</p>
                  {vehicle.sale.addons.length ? (
                    <ul className="mb-2 divide-y divide-slate-100">
                      {vehicle.sale.addons.map((addon) => (
                        <li key={addon.id} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-slate-700">
                            {addon.name}
                            {addon.provider ? <span className="text-slate-400"> · {addon.provider}</span> : null}
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="font-medium text-slate-800">{chf(addon.price)}</span>
                            <button
                              type="button"
                              onClick={() => deleteAddonMutation.mutate(addon.id)}
                              className="text-slate-400 transition-colors hover:text-rose-600"
                              title="Zusatzleistung entfernen"
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-2 text-sm text-slate-500">Keine Zusatzleistungen (z. B. Occasionsgarantie, Pneus, Rahmenabdeckung).</p>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Bezeichnung">
                      <Input value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })} placeholder="Occasionsgarantie 12 Monate" className="w-56" />
                    </Field>
                    <Field label="Anbieter">
                      <Input value={addonForm.provider} onChange={(e) => setAddonForm({ ...addonForm, provider: e.target.value })} placeholder="optional" className="w-44" />
                    </Field>
                    <Field label="Preis">
                      <Input type="number" min={0} step={10} value={addonForm.price} onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })} className="w-28" />
                    </Field>
                    <Button size="sm" variant="secondary" onClick={() => addAddonMutation.mutate()} disabled={addAddonMutation.isPending || !addonForm.name}>
                      <Plus size={13} /> Hinzufügen
                    </Button>
                  </div>
                </div>

                {/* Rechnung */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rechnung (Schweizer QR-Rechnung)</p>
                    {!vehicle.sale.invoices.some((i) => !i.isCredit && i.status !== "STORNIERT" && i.status !== "BEZAHLT") ? (
                      <div className="flex items-end gap-2">
                        <Field label="Abgaben (MWST-frei)">
                          <Input value={invoiceFees.description} onChange={(e) => setInvoiceFees({ ...invoiceFees, description: e.target.value })} placeholder="Kontrollscheine StVA" className="w-44" />
                        </Field>
                        <Field label="Betrag">
                          <Input type="number" min={0} value={invoiceFees.amount} onChange={(e) => setInvoiceFees({ ...invoiceFees, amount: e.target.value })} className="w-24" />
                        </Field>
                        <Button size="sm" onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending || !vehicle.sale.salePrice}>
                          <QrCode size={14} /> {invoiceMutation.isPending ? "Erstellt …" : "Rechnung mit QR erstellen"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {!settings?.qrIban ? (
                    <p className="mb-2 text-xs text-amber-700">Hinweis: In den Stammdaten ist noch kein QR-IBAN hinterlegt — die Rechnung erscheint ohne Zahlteil.</p>
                  ) : null}
                  {vehicle.sale.invoices.length === 0 ? (
                    <p className="text-sm text-slate-500">Noch keine Rechnung.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {vehicle.sale.invoices.map((inv) => {
                        const overdue = !inv.isCredit && (inv.status === "VERSANDT" || inv.status === "TEILZAHLUNG") && inv.dueAt && new Date(inv.dueAt) < new Date();
                        return (
                          <li key={inv.id} className="py-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800">
                                {inv.isCredit ? "Gutschrift" : "Rechnung"} {inv.number}
                              </span>
                              <Badge className={`${INVOICE_STATUS_STYLES[inv.status]} ring-slate-200`}>{INVOICE_STATUS_LABELS[inv.status]}</Badge>
                              {overdue ? <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Überfällig seit {formatDate(inv.dueAt)}</Badge> : null}
                              {inv.reminderLevel ? (
                                <Badge className="bg-amber-50 text-amber-700 ring-amber-200">
                                  {REMINDER_LEVEL_LABELS[inv.reminderLevel]}
                                  {inv.reminderDueAt ? ` · Frist ${formatDate(inv.reminderDueAt)}` : ""}
                                </Badge>
                              ) : null}
                              <span className="text-sm text-slate-600">{chf(inv.totalAmount)}</span>
                              <span className="text-[11px] text-slate-400">{formatDate(inv.issuedAt)}</span>
                              <span className="ml-auto flex items-center gap-1.5">
                                {!inv.isCredit && inv.status !== "BEZAHLT" && inv.status !== "STORNIERT" ? (
                                  <>
                                    {inv.reminderLevel < 1 ? (
                                      <Button size="sm" variant="secondary" onClick={() => reminderMutation.mutate({ invoiceId: inv.id, level: 1 })} disabled={reminderMutation.isPending}>
                                        <Bell size={13} /> Erinnerung
                                      </Button>
                                    ) : null}
                                    {inv.reminderLevel === 1 ? (
                                      <Button size="sm" variant="secondary" onClick={() => reminderMutation.mutate({ invoiceId: inv.id, level: 2 })} disabled={reminderMutation.isPending}>
                                        <Bell size={13} /> 1. Mahnung
                                      </Button>
                                    ) : null}
                                    {inv.reminderLevel === 2 ? (
                                      <Button size="sm" variant="secondary" onClick={() => reminderMutation.mutate({ invoiceId: inv.id, level: 3 })} disabled={reminderMutation.isPending}>
                                        <Bell size={13} /> 2. Mahnung
                                      </Button>
                                    ) : null}
                                  </>
                                ) : null}
                                {!inv.isCredit && inv.status !== "STORNIERT" ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      const reason = window.prompt("Grund für die Gutschrift (erscheint auf dem PDF):", "");
                                      if (reason) creditNoteMutation.mutate({ invoiceId: inv.id, reason });
                                    }}
                                  >
                                    Storno / Gutschrift
                                  </Button>
                                ) : null}
                                <Button size="sm" variant="secondary" onClick={() => apiDownload(`/invoices/${inv.id}/pdf`, `${inv.number}.pdf`)} title="PDF herunterladen">
                                  <Download size={13} /> PDF
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setEmailDocId(null);
                                    setEmailForm({ to: "", subject: `${inv.isCredit ? "Gutschrift" : "Rechnung"} ${inv.number}`, message: "" });
                                    setEmailModalOpen(true);
                                  }}
                                  title="PDF per E-Mail versenden"
                                >
                                  <Mail size={13} /> Mailen
                                </Button>
                              </span>
                            </div>
                            {inv.reason ? <p className="mt-1 text-xs text-slate-500">Grund: {inv.reason}</p> : null}
                            {inv.qrReference && !inv.isCredit ? <p className="mt-0.5 text-[11px] text-slate-400">QR-Referenz: {inv.qrReference.replace(/(.{5})/g, "$1 ").trim()}</p> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Zahlungen */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zahlungen (GwG: Bar ab CHF 100'000 mit Identitätsprüfung)</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setPaymentForm({ ...paymentForm, amount: "", method: "UEBERWEISUNG", paidAt: "", notes: "" });
                        setPaymentModalOpen(true);
                      }}
                    >
                      <CreditCard size={14} /> Zahlung erfassen
                    </Button>
                  </div>
                  {vehicle.sale.salePrice != null ? (
                    vehicle.sale.payments
                      .filter((p) => p.direction === "EINGANG")
                      .reduce((sum, p) => sum + p.amount, 0) > 0 || vehicle.sale.tradeInCredit ? (
                      <div
                        className={`mb-3 rounded-xl px-4 py-2.5 text-sm font-semibold ${
                          (vehicle.sale.openAmount ?? 0) > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {(vehicle.sale.openAmount ?? 0) > 0
                          ? `Offen: ${chf(vehicle.sale.openAmount)} von ${chf(vehicle.sale.salePrice)}${vehicle.sale.tradeInCredit ? " (zzgl. Eintausch-Abzug)" : ""}`
                          : "Voll bezahlt — kein offener Betrag."}
                      </div>
                    ) : null
                  ) : null}
                  {vehicle.sale.payments.length === 0 ? (
                    <p className="text-sm text-slate-500">Noch keine Zahlungen erfasst.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {vehicle.sale.payments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="text-slate-700">
                            {formatDate(p.paidAt)} · {PAYMENT_METHOD_LABELS[p.method ?? ""] ?? p.method ?? "—"}
                            {p.gwgIdentifiedAt ? (
                              <Badge className="ml-1.5 bg-emerald-50 text-emerald-700 ring-emerald-200">
                                <ShieldAlert size={11} className="mr-1 inline" /> GwG identifiziert
                              </Badge>
                            ) : null}
                            {p.notes ? <span className="text-slate-400"> · {p.notes}</span> : null}
                          </span>
                          <span className="flex items-center gap-3">
                            <span className={`font-medium ${p.direction === "EINGANG" ? "text-emerald-700" : "text-slate-600"}`}>
                              {p.direction === "EINGANG" ? "+" : "−"} {chf(p.amount)}
                            </span>
                            <button type="button" onClick={() => deletePaymentMutation.mutate(p.id)} className="text-slate-400 transition-colors hover:text-rose-600" title="Zahlung löschen">
                              <Trash2 size={14} />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}
      {tab === "anfragen" ? (
        <Card>
          <CardHeader
            title="Anfragen & Kommunikation"
            description="Telefon, WhatsApp, E-Mail, AutoScout24 — mit wem hast du was ausgemacht?"
            actions={
              <Button
                size="sm"
                onClick={() => {
                  setInquiryForm({ channel: "TELEFON", contactId: "", contactName: "", subject: "", summary: "", nextFollowUpAt: "" });
                  setInquiryEditing(null);
                  setInquiryModalOpen(true);
                }}
              >
                <Plus size={14} /> Anfrage protokollieren
              </Button>
            }
          />
          <div className="divide-y divide-slate-100">
            {vehicle.inquiries.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Noch keine Anfragen protokolliert.</p>
            ) : (
              vehicle.inquiries.map((inquiry) => {
                const phone = inquiry.contact?.mobile ?? inquiry.contact?.phone ?? null;
                const email = inquiry.contact?.email ?? null;
                const followUpOverdue = inquiry.nextFollowUpAt && !inquiry.resolvedAt && new Date(inquiry.nextFollowUpAt) < new Date();
                return (
                  <div key={inquiry.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{PURCHASE_CHANNEL_LABELS[inquiry.channel]}</Badge>
                      <span className="text-sm font-semibold text-slate-800">
                        {inquiry.contact?.displayName ?? inquiry.contactName ?? "Unbekannt"}
                      </span>
                      {inquiry.resolvedAt ? (
                        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Erledigt</Badge>
                      ) : inquiry.nextFollowUpAt ? (
                        <Badge className={followUpOverdue ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"}>
                          Wiedervorlage {formatDate(inquiry.nextFollowUpAt)}
                        </Badge>
                      ) : null}
                      <span className="text-[11px] text-slate-400">{formatDateTime(inquiry.createdAt)}</span>
                    </div>
                    {inquiry.subject ? <p className="mt-1 text-sm font-medium text-slate-700">{inquiry.subject}</p> : null}
                    {inquiry.summary ? <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{inquiry.summary}</p> : null}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {phone ? (
                        <>
                          <a
                            href={whatsappLink(phone)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <MessageCircle size={12} /> WhatsApp
                          </a>
                          <a
                            href={`tel:${phone}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Anrufen
                          </a>
                        </>
                      ) : null}
                      {email ? (
                        <a
                          href={`mailto:${email}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <Mail size={12} /> E-Mail
                        </a>
                      ) : null}
                      {!inquiry.resolvedAt ? (
                        <button
                          type="button"
                          onClick={() => updateInquiryMutation.mutate({ id: inquiry.id, body: { resolvedAt: new Date().toISOString() } })}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          <Check size={12} /> Erledigt
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Bearbeiten"
                        onClick={() => {
                          setInquiryEditing(inquiry);
                          setInquiryForm({
                            channel: inquiry.channel,
                            contactId: inquiry.contactId ?? "",
                            contactName: inquiry.contactName ?? "",
                            subject: inquiry.subject ?? "",
                            summary: inquiry.summary ?? "",
                            nextFollowUpAt: inquiry.nextFollowUpAt ? inquiry.nextFollowUpAt.slice(0, 10) : "",
                          });
                          setInquiryModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title="Löschen"
                        onClick={() => deleteInquiryMutation.mutate(inquiry.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      ) : null}

      {tab === "termine" ? (
        <Card>
          <CardHeader
            title="Termine zu diesem Fahrzeug"
            description="Besichtigungen, Probefahrten und Rückrufe — alle Termine auch im Kalender."
            actions={
              <Button
                size="sm"
                onClick={() => {
                  setAppointmentForm({ type: "BESICHTIGUNG", title: "", startsAt: "", endsAt: "", contactId: "", notes: "" });
                  setAppointmentEditing(null);
                  setAppointmentModalOpen(true);
                }}
              >
                <Plus size={14} /> Termin anlegen
              </Button>
            }
          />
          <div className="divide-y divide-slate-100">
            {vehicle.appointments.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Noch keine Termine.</p>
            ) : (
              vehicle.appointments.map((appointment) => (
                <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{APPOINTMENT_TYPE_LABELS[appointment.type]}</Badge>
                      <Badge className={APPOINTMENT_STATUS_STYLES[appointment.status]}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</Badge>
                      <span className="text-sm text-slate-800">{formatDateTime(appointment.startsAt)}</span>
                    </div>
                    <p className="mt-0.5 font-medium text-slate-900">{appointment.title}</p>
                    {appointment.notes ? <p className="text-xs text-slate-500">{appointment.notes}</p> : null}
                  </div>
                  <div className="flex gap-1.5">
                    {appointment.status === "GEPLANT" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, body: { status: "ERLEDIGT" } })}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          <Check size={12} /> Erledigt
                        </button>
                        <button
                          type="button"
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, body: { status: "ABGESAGT" } })}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
                        >
                          Absagen
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      title="Löschen"
                      onClick={() => deleteAppointmentMutation.mutate(appointment.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      ) : null}

      {/* Fahrzeugdaten bearbeiten */}
      <Modal
        open={editOpen && editForm != null}
        title="Fahrzeugdaten bearbeiten"
        onClose={() => setEditOpen(false)}
      >
        {editForm ? (
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marke *">
                <Input value={editForm.make} onChange={(e) => setEditForm({ ...editForm, make: e.target.value })} required />
              </Field>
              <Field label="Modell *">
                <Input value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} required />
              </Field>
            </div>
            <Field label="Typ / Bezeichnung">
              <Input value={editForm.variant} onChange={(e) => setEditForm({ ...editForm, variant: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stammnummer / CHID">
                <Input value={editForm.chassisNumber} onChange={(e) => setEditForm({ ...editForm, chassisNumber: e.target.value })} />
              </Field>
              <Field label="Erste Inverkehrtsetzung">
                <Input type="date" value={editForm.firstRegistration} onChange={(e) => setEditForm({ ...editForm, firstRegistration: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Kilometer">
                <Input type="number" min={0} value={editForm.mileageKm} onChange={(e) => setEditForm({ ...editForm, mileageKm: e.target.value })} />
              </Field>
              <Field label="Treibstoff">
                <Input value={editForm.fuel} onChange={(e) => setEditForm({ ...editForm, fuel: e.target.value })} />
              </Field>
              <Field label="Getriebe">
                <Input value={editForm.transmission} onChange={(e) => setEditForm({ ...editForm, transmission: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Farbe">
                <Input value={editForm.color} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} />
              </Field>
              <Field label="Kennzeichen">
                <Input value={editForm.plates} onChange={(e) => setEditForm({ ...editForm, plates: e.target.value })} />
              </Field>
              <Field label="MFK bis">
                <Input type="date" value={editForm.mfkUntil} onChange={(e) => setEditForm({ ...editForm, mfkUntil: e.target.value })} />
              </Field>
              <Field label="Zielpreis (CHF)">
                <Input type="number" min={0} step={100} value={editForm.targetSalePrice} onChange={(e) => setEditForm({ ...editForm, targetSalePrice: e.target.value })} />
              </Field>
            </div>
            <Field label="AutoScout24-Link" hint="Inserat-URL — Basis für QR-Code und Tafel">
              <Input value={editForm.as24Url} onChange={(e) => setEditForm({ ...editForm, as24Url: e.target.value })} placeholder="https://www.autoscout24.ch/…" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editForm.hasServiceBook}
                onChange={(e) => setEditForm({ ...editForm, hasServiceBook: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Serviceheft vorhanden
            </label>
            <Field label="Beschreibung" hint="Grundlage für Exposé und A3-Tafel">
              <textarea
                rows={4}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={saveVehicleMutation.isPending}>
                {saveVehicleMutation.isPending ? "Speichern …" : "Speichern"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Ankaufsvorgang anlegen */}
      <Modal
        open={purchaseCreateOpen}
        title="Ankaufsvorgang anlegen"
        description="Erstkontakt und Rahmen erfassen — die Kalkulation kannst du direkt danach ergänzen."
        onClose={() => setPurchaseCreateOpen(false)}
      >
        <form onSubmit={submitCreatePurchase} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kanal">
              <Select
                value={purchaseCreate?.channel ?? "TELEFON"}
                onChange={(e) => setPurchaseCreate({ ...purchaseCreate!, channel: e.target.value as PurchaseChannel })}
              >
                {PURCHASE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {PURCHASE_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Zahlungsart">
              <Select
                value={purchaseCreate?.paymentMethod ?? "UEBERWEISUNG"}
                onChange={(e) => setPurchaseCreate({ ...purchaseCreate!, paymentMethod: e.target.value as PurchasePaymentMethod })}
              >
                {(Object.keys(PURCHASE_PAYMENT_LABELS) as PurchasePaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PURCHASE_PAYMENT_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Verkäufer">
            <Select value={purchaseCreate?.sellerId ?? ""} onChange={(e) => setPurchaseCreate({ ...purchaseCreate!, sellerId: e.target.value })}>
              <option value="">– ohne Verkäufer –</option>
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notizen">
            <textarea
              rows={3}
              value={purchaseCreate?.notes ?? ""}
              onChange={(e) => setPurchaseCreate({ ...purchaseCreate!, notes: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPurchaseCreateOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createPurchaseMutation.isPending}>
              {createPurchaseMutation.isPending ? "Anlegen …" : "Anlegen"}
            </Button>
          </div>
        </form>
      </Modal>
      {/* Auftrag anlegen / bearbeiten */}
      <Modal
        open={woModalOpen}
        title={woEditing ? "Auftrag bearbeiten" : "Auftrag anlegen"}
        description="Reparatur, Service, MFK oder Aufbereitung — mit passendem Anbieter-Typ."
        onClose={() => setWoModalOpen(false)}
      >
        <form onSubmit={submitWorkOrder} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Art">
              <Select value={woForm.type} onChange={(e) => setWoForm({ ...woForm, type: e.target.value as WorkOrderType })}>
                {WORK_ORDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WORK_ORDER_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Anbieter-Typ">
              <Select
                value={woForm.providerType}
                onChange={(e) => setWoForm({ ...woForm, providerType: e.target.value as ProviderType })}
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROVIDER_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={woForm.status} onChange={(e) => setWoForm({ ...woForm, status: e.target.value as WorkOrderStatus })}>
                {WORK_ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {WORK_ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Beschreibung *">
            <Input
              value={woForm.description}
              onChange={(e) => setWoForm({ ...woForm, description: e.target.value })}
              placeholder="z. B. Hinterradlager rechts ersetzen"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Anbieter" hint="aus Stammdaten — oder leer lassen für Freitext">
              <Select value={woForm.providerId} onChange={(e) => setWoForm({ ...woForm, providerId: e.target.value })}>
                <option value="">– ohne gespeicherten Anbieter –</option>
                {(providers ?? []).map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.name} ({PROVIDER_TYPE_LABELS[pv.providerType]})
                  </option>
                ))}
              </Select>
            </Field>
            {!woForm.providerId ? (
              <Field label="Anbieter (Freitext)">
                <Input
                  value={woForm.providerName}
                  onChange={(e) => setWoForm({ ...woForm, providerName: e.target.value })}
                  placeholder="z. B. Dellen-Doktor"
                />
              </Field>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kosten-Schätzung (CHF)">
              <Input type="number" min={0} step={10} value={woForm.costEstimate} onChange={(e) => setWoForm({ ...woForm, costEstimate: e.target.value })} />
            </Field>
            {woEditing ? (
              <Field label="Ist-Kosten (CHF)">
                <Input type="number" min={0} step={10} value={woForm.costActual} onChange={(e) => setWoForm({ ...woForm, costActual: e.target.value })} />
              </Field>
            ) : null}
            <Field label="Geplant für">
              <Input type="date" value={woForm.plannedFor} onChange={(e) => setWoForm({ ...woForm, plannedFor: e.target.value })} />
            </Field>
          </div>
          <Field label="Notizen">
            <textarea
              rows={2}
              value={woForm.notes}
              onChange={(e) => setWoForm({ ...woForm, notes: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setWoModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createWorkOrderMutation.isPending || updateWorkOrderMutation.isPending}>
              {createWorkOrderMutation.isPending || updateWorkOrderMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Anbieter anlegen */}
      <Modal open={providerAddOpen} title="Anbieter anlegen" description="Werkstatt, Aufbereiter oder externer Spezialist als Stammdaten." onClose={() => setProviderAddOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPageError(null);
            createProviderMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *">
              <Input value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} required />
            </Field>
            <Field label="Typ">
              <Select
                value={providerForm.providerType}
                onChange={(e) => setProviderForm({ ...providerForm, providerType: e.target.value as ProviderType })}
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROVIDER_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Telefon">
            <Input value={providerForm.phone} onChange={(e) => setProviderForm({ ...providerForm, phone: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setProviderAddOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createProviderMutation.isPending}>
              {createProviderMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>
      {/* Anfrage protokollieren */}
      <Modal
        open={inquiryModalOpen}
        title={inquiryEditing ? "Anfrage bearbeiten" : "Anfrage protokollieren"}
        description="Kanal, Kontakt und Vereinbarung — Klick-Links erscheinen bei hinterlegten Kontaktdaten."
        onClose={() => setInquiryModalOpen(false)}
      >
        <form onSubmit={submitInquiry} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kanal">
              <Select value={inquiryForm.channel} onChange={(e) => setInquiryForm({ ...inquiryForm, channel: e.target.value as PurchaseChannel })}>
                {PURCHASE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {PURCHASE_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kontakt (bestehend)">
              <Select value={inquiryForm.contactId} onChange={(e) => setInquiryForm({ ...inquiryForm, contactId: e.target.value })}>
                <option value="">– Freitext unten –</option>
                {(contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!inquiryForm.contactId ? (
            <Field label="Wer meldet sich?" hint="Freitext, wenn noch kein Kontakt angelegt wurde">
              <Input value={inquiryForm.contactName} onChange={(e) => setInquiryForm({ ...inquiryForm, contactName: e.target.value })} />
            </Field>
          ) : null}
          <Field label="Betreff">
            <Input value={inquiryForm.subject} onChange={(e) => setInquiryForm({ ...inquiryForm, subject: e.target.value })} placeholder="z. B. WhatsApp: Probefahrt-Anfrage" />
          </Field>
          <Field label="Verlauf / Vereinbarung">
            <textarea
              rows={4}
              value={inquiryForm.summary}
              onChange={(e) => setInquiryForm({ ...inquiryForm, summary: e.target.value })}
              placeholder="Was wurde ausgemacht?"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <Field label="Wiedervorlage">
            <Input type="date" value={inquiryForm.nextFollowUpAt} onChange={(e) => setInquiryForm({ ...inquiryForm, nextFollowUpAt: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setInquiryModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createInquiryMutation.isPending || updateInquiryMutation.isPending}>
              {createInquiryMutation.isPending || updateInquiryMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Termin anlegen / bearbeiten */}
      <Modal
        open={appointmentModalOpen}
        title={appointmentEditing ? "Termin bearbeiten" : "Termin anlegen"}
        description="Besichtigungen und Probefahrten landen automatisch im Kalender."
        onClose={() => setAppointmentModalOpen(false)}
      >
        <form onSubmit={submitAppointment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Art">
              <Select value={appointmentForm.type} onChange={(e) => setAppointmentForm({ ...appointmentForm, type: e.target.value as AppointmentType })}>
                {APPOINTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {APPOINTMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Titel *">
              <Input value={appointmentForm.title} onChange={(e) => setAppointmentForm({ ...appointmentForm, title: e.target.value })} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Beginn *">
              <Input type="datetime-local" value={appointmentForm.startsAt} onChange={(e) => setAppointmentForm({ ...appointmentForm, startsAt: e.target.value })} required />
            </Field>
            <Field label="Ende">
              <Input type="datetime-local" value={appointmentForm.endsAt} onChange={(e) => setAppointmentForm({ ...appointmentForm, endsAt: e.target.value })} />
            </Field>
          </div>
          <Field label="Kontakt">
            <Select value={appointmentForm.contactId} onChange={(e) => setAppointmentForm({ ...appointmentForm, contactId: e.target.value })}>
              <option value="">– ohne –</option>
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notizen">
            <textarea
              rows={2}
              value={appointmentForm.notes}
              onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAppointmentModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createAppointmentMutation.isPending || updateAppointmentMutation.isPending}>
              {createAppointmentMutation.isPending || updateAppointmentMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Dokument ansehen (in der App, kein Popup) */}
      <Modal
        open={docView != null}
        title={docView?.name ?? "Dokument"}
        description="Vorschau — über das Download-Symbol in der Liste kannst du die Datei speichern."
        onClose={() => {
          if (docView) URL.revokeObjectURL(docView.url);
          setDocView(null);
        }}
        wide
      >
        {docView ? (
          docView.mime.startsWith("image/") ? (
            <div className="max-h-[70vh] overflow-auto text-center">
              <img src={docView.url} alt={docView.name} className="mx-auto max-w-full rounded-lg" />
            </div>
          ) : (
            <iframe src={docView.url} title={docView.name} className="h-[70vh] w-full rounded-lg border border-slate-200" />
          )
        ) : null}
      </Modal>

      {/* Verkaufsvorgang erfassen / bearbeiten */}
      <Modal
        open={saleModalOpen}
        title="Verkaufsvorgang"
        description="Käufer, Preis und Zahlungsart — Basis für Kaufvertrag und QR-Rechnung."
        onClose={() => setSaleModalOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPageError(null);
            saveSaleMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Käufer (Kontakt)">
              <Select value={saleForm.buyerId} onChange={(e) => setSaleForm({ ...saleForm, buyerId: e.target.value })}>
                <option value="">– Kein Kontakt zugeordnet –</option>
                {(contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={saleForm.status} onChange={(e) => setSaleForm({ ...saleForm, status: e.target.value as SaleStatus })}>
                {SALE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SALE_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Verkaufspreis (CHF, inkl. MWST)">
              <Input type="number" min={0} step={100} value={saleForm.salePrice} onChange={(e) => setSaleForm({ ...saleForm, salePrice: e.target.value })} />
            </Field>
            <Field label="Zahlungsart">
              <Select value={saleForm.paymentMethod} onChange={(e) => setSaleForm({ ...saleForm, paymentMethod: e.target.value as SalePaymentMethod })}>
                {(Object.keys(SALE_PAYMENT_LABELS) as SalePaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {SALE_PAYMENT_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Verkauft am">
              <Input type="date" value={saleForm.soldAt} onChange={(e) => setSaleForm({ ...saleForm, soldAt: e.target.value })} />
            </Field>
          </div>
          {saleForm.paymentMethod === "LEASING" || saleForm.paymentMethod === "FINANZIERUNG" ? (
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
              <Field label="Leasing-/Finanzierungspartner">
                <Input value={saleForm.leasingPartner} onChange={(e) => setSaleForm({ ...saleForm, leasingPartner: e.target.value })} placeholder="z. B. Bank oder Leasinggesellschaft" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Monatsrate">
                  <Input type="number" min={0} value={saleForm.leasingMonthlyRate} onChange={(e) => setSaleForm({ ...saleForm, leasingMonthlyRate: e.target.value })} />
                </Field>
                <Field label="Dauer (Monate)">
                  <Input type="number" min={1} value={saleForm.leasingTermMonths} onChange={(e) => setSaleForm({ ...saleForm, leasingTermMonths: e.target.value })} />
                </Field>
                <Field label="Anzahlung">
                  <Input type="number" min={0} value={saleForm.leasingDownPayment} onChange={(e) => setSaleForm({ ...saleForm, leasingDownPayment: e.target.value })} />
                </Field>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3">
            <Field label="Eintausch-Abzug (CHF)">
              <Input type="number" min={0} value={saleForm.tradeInCredit} onChange={(e) => setSaleForm({ ...saleForm, tradeInCredit: e.target.value })} placeholder="optional" />
            </Field>
            <div className="col-span-2">
              <Field label="Eintausch-Fahrzeug" hint="Erscheint als Abzugsposten auf der Rechnung">
                <Input value={saleForm.tradeInDescription} onChange={(e) => setSaleForm({ ...saleForm, tradeInDescription: e.target.value })} placeholder="z. B. VW Passat, SH-99999" />
              </Field>
            </div>
          </div>
          <Field label="Notizen">
            <textarea
              rows={2}
              value={saleForm.notes}
              onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setSaleModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saveSaleMutation.isPending}>
              {saveSaleMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Zahlung erfassen */}
      <Modal
        open={paymentModalOpen}
        title="Zahlung erfassen"
        description="Eingänge des Käufers — Rechnungen werden automatisch als bezahlt markiert."
        onClose={() => setPaymentModalOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPageError(null);
            paymentMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Betrag (CHF)">
              <Input type="number" min={0.01} step={0.01} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} required />
            </Field>
            <Field label="Methode">
              <Select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                <option value="UEBERWEISUNG">Überweisung</option>
                <option value="BAR">Bar</option>
                <option value="LEASING">Leasing-Auszahlung</option>
                <option value="SONSTIGES">Sonstiges</option>
              </Select>
            </Field>
            <Field label="Datum">
              <Input type="date" value={paymentForm.paidAt} onChange={(e) => setPaymentForm({ ...paymentForm, paidAt: e.target.value })} />
            </Field>
          </div>
          {paymentForm.method === "BAR" && Number(paymentForm.amount) >= 100000 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-amber-800">
                <ShieldAlert size={14} /> Barzahlung ab CHF 100'000 — Identitätsprüfung nötig (GwG Art. 20)
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label="Identität festgestellt am">
                  <Input type="date" value={paymentForm.gwgIdentifiedAt} onChange={(e) => setPaymentForm({ ...paymentForm, gwgIdentifiedAt: e.target.value })} />
                </Field>
                <Field label="Ausweisdokument">
                  <Input value={paymentForm.gwgIdDocument} onChange={(e) => setPaymentForm({ ...paymentForm, gwgIdDocument: e.target.value })} placeholder="z. B. Pass X1234567" />
                </Field>
              </div>
            </div>
          ) : null}
          <Field label="Notizen">
            <Input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="optional" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPaymentModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* PDF per E-Mail versenden */}
      <Modal
        open={emailModalOpen}
        title="PDF per E-Mail"
        description="Angebot, Verträge, Rechnungen und Mahnungen als Anhang versenden (lokal via Mailhog getestet)."
        onClose={() => setEmailModalOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPageError(null);
            if (emailDocId) emailDocMutation.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Dokument">
            <Select value={emailDocId ?? ""} onChange={(e) => setEmailDocId(e.target.value)}>
              <option value="">– Dokument wählen –</option>
              {vehicle.generatedDocuments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="An (E-Mail)">
            <Input type="email" value={emailForm.to} onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })} required />
          </Field>
          <Field label="Betreff">
            <Input value={emailForm.subject} onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })} />
          </Field>
          <Field label="Nachricht">
            <textarea
              rows={3}
              value={emailForm.message}
              onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
              placeholder="Anbei das Dokument …"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEmailModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={emailDocMutation.isPending || !emailDocId}>
              <Send size={14} /> {emailDocMutation.isPending ? "Senden …" : "Senden"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
