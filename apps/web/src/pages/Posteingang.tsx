import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, Download, Inbox, Mail, MailCheck, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { api, apiDownload } from "../lib/api";
import {
  chf,
  formatDate,
  LEAD_FILE_KIND_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STYLES,
  PURCHASE_CHANNEL_LABELS,
  PURCHASE_CHANNELS,
  type ContactListItem,
  type LeadDetail,
  type LeadFile,
  type LeadFileKind,
  type LeadListItem,
  type LeadStatus,
  type PurchaseChannel,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_STYLES,
  type EmailLogInfo,
} from "../lib/types";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Spinner } from "../components/ui";

type FormState = {
  channel: PurchaseChannel;
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  make: string;
  model: string;
  variant: string;
  mileageKm: string;
  year: string;
  askingPrice: string;
  message: string;
};

const emptyForm: FormState = {
  channel: "WHATSAPP",
  sellerName: "",
  sellerPhone: "",
  sellerEmail: "",
  make: "",
  model: "",
  variant: "",
  mileageKm: "",
  year: "",
  askingPrice: "",
  message: "",
};

type ConvertForm = {
  make: string;
  model: string;
  variant: string;
  chassisNumber: string;
  firstRegistration: string;
  mileageKm: string;
  targetSalePrice: string;
  contactMode: "NEU" | "BESTEHEND";
  contactId: string;
  contactFirstName: string;
  contactLastName: string;
  contactCompanyName: string;
  contactType: "PRIVAT" | "FIRMA";
};

export default function Posteingang() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "ALLE">("ALLE");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [detailOpen, setDetailOpen] = useState<LeadDetail | null>(null);
  const [convertLead, setConvertLead] = useState<LeadListItem | null>(null);
  const [convertForm, setConvertForm] = useState<ConvertForm | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [tab, setEmailTab] = useState<"anfragen" | "emails">("anfragen");

  const { data, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: () => api<LeadListItem[]>("/leads"),
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api<ContactListItem[]>("/contacts"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api("/leads", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          mileageKm: form.mileageKm || null,
          year: form.year || null,
          askingPrice: form.askingPrice || null,
        }),
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: LeadStatus }) =>
      api(`/leads/${payload.id}`, { method: "PUT", body: JSON.stringify({ status: payload.status }) }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/leads/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const fileUploadMutation = useMutation({
    mutationFn: (payload: { leadId: string; file: File; kind: LeadFileKind }) => {
      const body = new FormData();
      body.append("file", payload.file);
      body.append("kind", payload.kind);
      return api<LeadFile>(`/leads/${payload.leadId}/files`, { method: "POST", body });
    },
    onSuccess: async (file) => {
      invalidate();
      const refreshed = await api<LeadDetail>(`/leads/${file.leadId}`);
      setDetailOpen(refreshed);
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const fileDeleteMutation = useMutation({
    mutationFn: (payload: { leadId: string; fileId: string }) =>
      api(`/leads/${payload.leadId}/files/${payload.fileId}`, { method: "DELETE" }),
    onSuccess: async (_result, payload) => {
      invalidate();
      const refreshed = await api<LeadDetail>(`/leads/${payload.leadId}`);
      setDetailOpen(refreshed);
    },
    onError: (err: Error) => setPageError(err.message),
  });

  // ── E-Mail-Eingang (IMAP-Automatik + manuelles Nachholen) ────────────────
  const { data: emails, isLoading: emailsLoading } = useQuery({
    queryKey: ["emails"],
    queryFn: () => api<EmailLogInfo[]>("/emails"),
  });

  const fetchNowMutation = useMutation({
    mutationFn: () => api<{ imported: number; skipped?: string; configured: boolean }>("/emails/fetch-now", { method: "POST" }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setPageError(result.configured ? null : `IMAP nicht konfiguriert: ${result.skipped ?? ""}`);
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const emailSeenMutation = useMutation({
    mutationFn: (id: string) => api<EmailLogInfo>(`/emails/${id}/seen`, { method: "PUT" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["emails"] }),
    onError: (err: Error) => setPageError(err.message),
  });

  const emailConvertMutation = useMutation({
    mutationFn: (id: string) => api<{ lead: { id: string } }>(`/emails/${id}/convert`, { method: "POST" }),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      setEmailTab("anfragen");
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const convertMutation = useMutation({
    mutationFn: (payload: { leadId: string; body: Record<string, unknown> }) =>
      api<{ vehicleId: string; dealId: string }>(`/leads/${payload.leadId}/convert`, { method: "POST", body: JSON.stringify(payload.body) }),
    onSuccess: async (result) => {
      setConvertLead(null);
      setConvertForm(null);
      invalidate();
      navigate(`/fahrzeuge/${result.vehicleId}`);
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const filtered = useMemo(
    () => (data ?? []).filter((l) => statusFilter === "ALLE" || l.status === statusFilter),
    [data, statusFilter],
  );

  const newCount = (data ?? []).filter((l) => l.status === "NEU").length;

  function openCreate() {
    setForm(emptyForm);
    setPageError(null);
    setCreateOpen(true);
  }

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    setPageError(null);
    createMutation.mutate();
  }

  function openConvert(lead: LeadListItem) {
    setPageError(null);
    setConvertLead(lead);
    setConvertForm({
      make: lead.make ?? "",
      model: lead.model ?? "",
      variant: lead.variant ?? "",
      chassisNumber: "",
      firstRegistration: lead.year ? `${lead.year}-01-01` : "",
      mileageKm: lead.mileageKm?.toString() ?? "",
      targetSalePrice: "",
      contactMode: "NEU",
      contactId: "",
      contactFirstName: (lead.sellerName ?? "").split(" ")[0] ?? "",
      contactLastName: (lead.sellerName ?? "").split(" ").slice(1).join(" "),
      contactCompanyName: "",
      contactType: "PRIVAT",
    });
  }

  function submitConvert(event: FormEvent) {
    event.preventDefault();
    if (!convertForm || !convertLead) return;
    const contact =
      convertForm.contactMode === "NEU"
        ? {
            type: convertForm.contactType,
            firstName: convertForm.contactFirstName,
            lastName: convertForm.contactLastName,
            companyName: convertForm.contactCompanyName,
            mobile: convertLead.sellerPhone ?? undefined,
            email: convertLead.sellerEmail ?? undefined,
          }
        : undefined;
    convertMutation.mutate({
      leadId: convertLead.id,
      body: {
        contactId: convertForm.contactMode === "BESTEHEND" ? convertForm.contactId || null : null,
        contact,
        vehicle: {
          make: convertForm.make,
          model: convertForm.model,
          variant: convertForm.variant,
          chassisNumber: convertForm.chassisNumber,
          firstRegistration: convertForm.firstRegistration || null,
          mileageKm: convertForm.mileageKm || null,
          targetSalePrice: convertForm.targetSalePrice || null,
        },
      },
    });
  }

  const leadFiles = detailOpen?.files ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Inbox size={20} className="text-amber-500" /> Posteingang
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Was reinkommt, erscheint von selbst: Web-Formular und E-Mails automatisch — WhatsApp und Telefon protokollierst du hier.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "emails" ? (
            <Button onClick={() => fetchNowMutation.mutate()} disabled={fetchNowMutation.isPending}>
              <RefreshCw size={16} className={fetchNowMutation.isPending ? "animate-spin" : ""} />{" "}
              {fetchNowMutation.isPending ? "Hole …" : "Jetzt abholen"}
            </Button>
          ) : null}
          <Button onClick={openCreate}>
            <Plus size={16} /> Anfrage erfassen
          </Button>
        </div>
      </div>

      {pageError ? <Alert>{pageError}</Alert> : null}

      <div className="flex gap-2">
        {([
          ["anfragen", `Ankaufsanfragen (${data?.length ?? 0})`],
          ["emails", `E-Mails${emails?.some((e) => e.status === "NEU") ? " ·" : ""} (${emails?.length ?? 0})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setEmailTab(key)}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
              tab === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "emails" ? (
        <Card>
          <CardHeader
            title="E-Mail-Eingang"
            description="Abgeholt aus dem Postfach (IMAP) — Absender werden automatisch als Kontakt angelegt bzw. zugeordnet und in der Kunden-Historie vermerkt."
          />
          {emailsLoading ? (
            <div className="px-5 py-10">
              <Spinner label="E-Mails werden geladen …" />
            </div>
          ) : (emails ?? []).length === 0 ? (
            <EmptyState
              title="Noch keine E-Mails eingegangen"
              description="Sobald der IMAP-Eingang konfiguriert ist, erscheinen neue E-Mails hier automatisch — oder mit «Jetzt abholen» sofort."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {(emails ?? []).map((email) => (
                <div key={email.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={EMAIL_STATUS_STYLES[email.status]}>{EMAIL_STATUS_LABELS[email.status]}</Badge>
                        {email.isNewContact ? (
                          <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Neuer Kontakt angelegt</Badge>
                        ) : null}
                        {email.contactName ? <span className="text-xs text-slate-500">Kontaktverknüpfung: {email.contactName}</span> : null}
                        <span className="text-[11px] text-slate-400">{formatDate(email.receivedAt)}</span>
                      </div>
                      <p className="mt-1.5 font-semibold text-slate-900">{email.subject ?? "(kein Betreff)"}</p>
                      <p className="text-sm text-slate-600">
                        {email.fromName ?? "—"} <span className="text-slate-400">&lt;{email.fromEmail}&gt;</span>
                      </p>
                      {email.body ? (
                        <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-500">{email.body}</p>
                      ) : null}
                      {email.attachments.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {email.attachments.map((filename, index) => (
                            <button
                              key={filename}
                              type="button"
                              onClick={() => apiDownload(`/emails/${email.id}/attachments/${index}`, filename)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              <Download size={11} /> Anhang {index + 1}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {email.status === "NEU" ? (
                        <Button size="sm" variant="secondary" onClick={() => emailSeenMutation.mutate(email.id)}>
                          <MailCheck size={14} /> Gelesen
                        </Button>
                      ) : null}
                      {email.status !== "ZUGEORDNET" ? (
                        <Button size="sm" onClick={() => emailConvertMutation.mutate(email.id)}>
                          <Mail size={14} /> Als Ankaufsanfrage übernehmen
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === "anfragen" ? (
        <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("ALLE")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
            statusFilter === "ALLE" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"
          }`}
        >
          Alle ({data?.length ?? 0})
        </button>
        {LEAD_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
              statusFilter === status ? "bg-slate-900 text-white ring-slate-900" : `${LEAD_STATUS_STYLES[status]} hover:opacity-80`
            }`}
          >
            {LEAD_STATUS_LABELS[status]} ({(data ?? []).filter((l) => l.status === status).length})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Ankaufsanfragen" description={`${filtered.length} Einträge`} />
        {isLoading ? (
          <div className="px-5 py-10">
            <Spinner label="Anfragen werden geladen …" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={newCount === 0 && (data?.length ?? 0) === 0 ? "Noch keine Anfragen" : "Keine Anfragen in diesem Filter"}
            description="Neue Anfragen erscheinen hier — erfasse den Erstkontakt direkt, inklusive Fotos und Fahrzeugausweis."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} /> Anfrage erfassen
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((lead) => (
              <div key={lead.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={async () => {
                    const detail = await api<LeadDetail>(`/leads/${lead.id}`);
                    setDetailOpen(detail);
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={LEAD_STATUS_STYLES[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{PURCHASE_CHANNEL_LABELS[lead.channel]}</Badge>
                    <span className="text-[11px] text-slate-400">{formatDate(lead.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 font-semibold text-slate-900">{lead.sellerName ?? "Unbekannter Verkäufer"}</p>
                  <p className="text-sm text-slate-600">
                    {[lead.make, lead.model, lead.variant].filter(Boolean).join(" ") || "Fahrzeug noch offen"}
                    {lead.mileageKm ? ` · ${lead.mileageKm.toLocaleString("de-CH")} km` : ""}
                    {lead.year ? ` · EZ ${lead.year}` : ""}
                    {lead.askingPrice != null ? ` · Wunsch ${chf(lead.askingPrice)}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {lead.sellerPhone ?? lead.sellerEmail ?? "ohne Kontaktdaten"}
                    {lead.photoCount ? ` · ${lead.photoCount} Fotos` : ""}
                    {lead.documentCount ? ` · ${lead.documentCount} Beleg(e)` : ""}
                    {lead.vehicle ? " · übernommen" : ""}
                  </p>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {lead.status === "NEU" ? (
                    <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate({ id: lead.id, status: "GEPRUEFT" })}>
                      <Check size={14} /> Geprüft
                    </Button>
                  ) : null}
                  {lead.status !== "UEBERNOMMEN" && lead.status !== "VERWORFEN" ? (
                    <Button size="sm" onClick={() => openConvert(lead)}>
                      <ArrowRightLeft size={14} /> Übernehmen
                    </Button>
                  ) : null}
                  {lead.vehicle ? (
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/fahrzeuge/${lead.vehicle!.id}`)}>
                      Zum Fahrzeug
                    </Button>
                  ) : null}
                  {lead.status !== "UEBERNOMMEN" ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => statusMutation.mutate({ id: lead.id, status: "VERWORFEN" })}
                        title="Verwerfen"
                      >
                        <X size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(lead.id)}
                        title="Löschen"
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
        </>
      ) : null}

      {/* Neue Anfrage */}
      <Modal open={createOpen} title="Ankaufsanfrage erfassen" description="Erstkontakt inkl. Kontaktdaten und Fahrzeugangaben." onClose={() => setCreateOpen(false)}>
        <form onSubmit={submitCreate} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kanal">
              <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as PurchaseChannel })}>
                {PURCHASE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {PURCHASE_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name Verkäufer/in">
              <Input value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} />
            </Field>
            <Field label="Telefon / WhatsApp">
              <Input value={form.sellerPhone} onChange={(e) => setForm({ ...form, sellerPhone: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="E-Mail">
              <Input type="email" value={form.sellerEmail} onChange={(e) => setForm({ ...form, sellerEmail: e.target.value })} />
            </Field>
            <Field label="Marke">
              <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </Field>
            <Field label="Modell">
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Typ">
              <Input value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} />
            </Field>
            <Field label="km">
              <Input type="number" min={0} value={form.mileageKm} onChange={(e) => setForm({ ...form, mileageKm: e.target.value })} />
            </Field>
            <Field label="Baujahr">
              <Input type="number" min={1950} max={2100} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            </Field>
            <Field label="Preisvorstellung">
              <Input type="number" min={0} step={100} value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
            </Field>
          </div>
          <Field label="Notizen aus dem Erstkontakt">
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <p className="text-xs text-slate-500">Fotos und den Fahrzeugausweis lädst du direkt in der Anfrage hoch (nach dem Speichern).</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Anfrage-Detail */}
      <Modal
        open={detailOpen != null}
        title={detailOpen?.sellerName ?? "Ankaufsanfrage"}
        description={detailOpen ? `${PURCHASE_CHANNEL_LABELS[detailOpen.channel]} · ${formatDate(detailOpen.createdAt)}` : undefined}
        onClose={() => setDetailOpen(null)}
      >
        {detailOpen ? (
          <div className="space-y-4">
            {detailOpen.message ? (
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="whitespace-pre-line">{detailOpen.message}</p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telefon</p>
                {detailOpen.sellerPhone ? (
                  <p className="text-slate-800">
                    <a href={`tel:${detailOpen.sellerPhone.replace(/\s/g, "")}`} className="hover:underline">{detailOpen.sellerPhone}</a>
                  </p>
                ) : (
                  <p className="text-slate-800">–</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">E-Mail</p>
                {detailOpen.sellerEmail ? (
                  <p className="text-slate-800">
                    <a href={`mailto:${detailOpen.sellerEmail}`} className="hover:underline">{detailOpen.sellerEmail}</a>
                  </p>
                ) : (
                  <p className="text-slate-800">–</p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dateien</p>
                <div className="flex gap-1.5">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Upload size={13} /> Fotos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        setPageError(null);
                        const files = Array.from(e.target.files ?? []);
                        if (!files.length) return;
                        (async () => {
                          for (const f of files) {
                            if (f.size > 8 * 1024 * 1024) {
                              setPageError(`«${f.name}» ist grösser als 8 MB.`);
                              continue;
                            }
                            await fileUploadMutation.mutateAsync({ leadId: detailOpen.id, file: f, kind: "FOTO" });
                          }
                        })();
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Upload size={13} /> Fahrzeugausweis
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        setPageError(null);
                        const f = e.target.files?.[0];
                        if (!f) return;
                        void fileUploadMutation.mutateAsync({ leadId: detailOpen.id, file: f, kind: "FAHRZEUGAUSWEIS" });
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              {leadFiles.filter((f) => f.kind === "FOTO").length ? (
                <div className="grid grid-cols-3 gap-2">
                  {leadFiles
                    .filter((f) => f.kind === "FOTO")
                    .map((f) => (
                      <div key={f.id} className="group relative">
                        <img src={`/uploads/leads/${f.filename}`} alt={f.originalName ?? "Foto"} className="aspect-square w-full rounded-lg object-cover ring-1 ring-slate-200" />
                        <button
                          type="button"
                          title="Löschen"
                          onClick={() => fileDeleteMutation.mutate({ leadId: detailOpen.id, fileId: f.id })}
                          className="absolute right-1 top-1 rounded bg-slate-950/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Noch keine Fotos hochgeladen.</p>
              )}
              {leadFiles.filter((f) => f.kind !== "FOTO").length ? (
                <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {leadFiles
                    .filter((f) => f.kind !== "FOTO")
                    .map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{LEAD_FILE_KIND_LABELS[f.kind]}</Badge>
                          <span className="ml-2 truncate text-sm text-slate-700">{f.originalName ?? f.filename}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Herunterladen"
                            onClick={() => apiDownload(`/leads/${detailOpen.id}/files/${f.id}`, f.originalName ?? f.filename)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            type="button"
                            title="Löschen"
                            onClick={() => fileDeleteMutation.mutate({ leadId: detailOpen.id, fileId: f.id })}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Übernehmen: Fahrzeug + Verkäufer festlegen */}
      <Modal
        open={convertLead != null}
        title="Anfrage übernehmen"
        description="Legt Fahrzeug und Ankaufsvorgang an; Fotos und Fahrzeugausweis werden mitgenommen."
        onClose={() => setConvertLead(null)}
      >
        {convertForm ? (
          <form onSubmit={submitConvert} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Marke *">
                <Input value={convertForm.make} onChange={(e) => setConvertForm({ ...convertForm, make: e.target.value })} required />
              </Field>
              <Field label="Modell *">
                <Input value={convertForm.model} onChange={(e) => setConvertForm({ ...convertForm, model: e.target.value })} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Typ">
                <Input value={convertForm.variant} onChange={(e) => setConvertForm({ ...convertForm, variant: e.target.value })} />
              </Field>
              <Field label="Stammnummer / CHID">
                <Input value={convertForm.chassisNumber} onChange={(e) => setConvertForm({ ...convertForm, chassisNumber: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Erste Inverkehrtsetzung">
                <Input type="date" value={convertForm.firstRegistration} onChange={(e) => setConvertForm({ ...convertForm, firstRegistration: e.target.value })} />
              </Field>
              <Field label="km">
                <Input type="number" min={0} value={convertForm.mileageKm} onChange={(e) => setConvertForm({ ...convertForm, mileageKm: e.target.value })} />
              </Field>
              <Field label="Zielverkaufspreis">
                <Input type="number" min={0} step={100} value={convertForm.targetSalePrice} onChange={(e) => setConvertForm({ ...convertForm, targetSalePrice: e.target.value })} />
              </Field>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConvertForm({ ...convertForm, contactMode: "NEU" })}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${convertForm.contactMode === "NEU" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Neuen Kontakt anlegen
                </button>
                <button
                  type="button"
                  onClick={() => setConvertForm({ ...convertForm, contactMode: "BESTEHEND" })}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${convertForm.contactMode === "BESTEHEND" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Bestehenden Kontakt wählen
                </button>
              </div>
              {convertForm.contactMode === "NEU" ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(["PRIVAT", "FIRMA"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setConvertForm({ ...convertForm, contactType: t })}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${convertForm.contactType === t ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}
                      >
                        {t === "PRIVAT" ? "Privat" : "Firma"}
                      </button>
                    ))}
                  </div>
                  {convertForm.contactType === "PRIVAT" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Vorname">
                        <Input value={convertForm.contactFirstName} onChange={(e) => setConvertForm({ ...convertForm, contactFirstName: e.target.value })} />
                      </Field>
                      <Field label="Nachname">
                        <Input value={convertForm.contactLastName} onChange={(e) => setConvertForm({ ...convertForm, contactLastName: e.target.value })} />
                      </Field>
                    </div>
                  ) : (
                    <Field label="Firmenname">
                      <Input value={convertForm.contactCompanyName} onChange={(e) => setConvertForm({ ...convertForm, contactCompanyName: e.target.value })} />
                    </Field>
                  )}
                </div>
              ) : (
                <Field label="Verkäufer-Kontakt">
                  <Select value={convertForm.contactId} onChange={(e) => setConvertForm({ ...convertForm, contactId: e.target.value })}>
                    <option value="">– wählen –</option>
                    {(contacts ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setConvertLead(null)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={convertMutation.isPending}>
                {convertMutation.isPending ? "Übernehmen …" : "Fahrzeug anlegen"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
