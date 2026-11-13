import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowLeftSquare, ArrowRightSquare, Download, ExternalLink, FileText, Info, Plus, Save, Trash2, Upload } from "lucide-react";
import { api, apiDownload } from "../lib/api";
import {
  chf,
  formatDate,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  GENERATED_DOC_LABELS,
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
  type ContactListItem,
  type DocumentKind,
  type GeneratedDocumentInfo,
  type PurchaseDeal,
  type PurchasePaymentMethod,
  type PurchaseStatus,
  type PurchaseChannel,
  type Setting,
  type ValuationItem,
  type ValuationKind,
  type VehicleDetail,
  type VehicleStatus,
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

function PhasePlaceholder({ title, phase, text }: { title: string; phase: string; text: string }) {
  return (
    <Card>
      <CardHeader title={title} description={text} />
      <div className="px-5 py-12 text-center">
        <p className="text-sm font-semibold text-slate-700">Folgt in {phase}</p>
        <p className="mt-1 max-w-md mx-auto text-xs text-slate-500">
          Datenmodell und Tabellen sind bereits vorbereitet — diese Ansicht wird in der nächsten Ausbaustufe aktiv.
        </p>
      </div>
    </Card>
  );
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
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
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
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">
                    <Upload size={14} /> Dokument hochladen
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 8 * 1024 * 1024) {
                          setPageError("Datei grösser als 8 MB.");
                          return;
                        }
                        docUploadMutation.mutate({ file, kind: docKind });
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              }
            />
            <div className="divide-y divide-slate-100 px-5 py-2">
              {vehicle.documents.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">Noch keine Dokumente (PDF oder Bild, max. 8 MB).</p>
              ) : (
                vehicle.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{DOCUMENT_KIND_LABELS[doc.kind]}</Badge>
                        <p className="truncate text-sm text-slate-700">{doc.originalName ?? doc.filename}</p>
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
                      <button
                        type="button"
                        title="PDF herunterladen"
                        onClick={() => apiDownload(`/documents/${d.id}`, `${d.title}.pdf`)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Download size={15} />
                      </button>
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
        <PhasePlaceholder
          title="Aufträge & Aufbereitung"
          phase="Phase C"
          text="Reparatur, Service, MFK und Aufbereitung — intern, Markenwerkstatt, Partnerwerkstatt oder extern."
        />
      ) : null}
      {tab === "verkauf" ? (
        <PhasePlaceholder
          title="Verkauf"
          phase="Phase D"
          text="Exposé, AutoScout24-Vorbereitung, A3-Tafel mit QR-Code und das Kaufverfahren."
        />
      ) : null}
      {tab === "anfragen" ? (
        <PhasePlaceholder
          title="Anfragen & Kommunikation"
          phase="Phase D"
          text="Telefon, WhatsApp, E-Mail und AutoScout24-Anfragen protokolliert pro Fahrzeug."
        />
      ) : null}
      {tab === "termine" ? (
        <PhasePlaceholder
          title="Termine"
          phase="Phase D"
          text="Besichtigungen, Probefahrten und Rückrufe im Kalender."
        />
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
    </div>
  );
}
