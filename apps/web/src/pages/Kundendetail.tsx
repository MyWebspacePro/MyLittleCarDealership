import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowLeftSquare, ArrowRightSquare, Mail, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { api, apiDownload } from "../lib/api";
import {
  chf,
  formatDate,
  formatDateTime,
  whatsappLink,
  CONTACT_TYPE_LABELS,
  COMMUNICATION_DIRECTION_LABELS,
  COMMUNICATION_DIRECTION_STYLES,
  COMMUNICATION_SOURCE_LABELS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  PURCHASE_CHANNEL_LABELS,
  REMINDER_LEVEL_LABELS,
  SALE_STATUS_LABELS,
  type CommunicationDirection,
  type CommunicationEntry,
  type ContactDetail,
  type CustomerInvoiceInfo,
} from "../lib/types";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Spinner } from "../components/ui";

// CRM-Kundendetail (Phase H): Stammdaten mit klickbaren Nummern (tel: —
// am Handy Direktwahl, am Mac via Apple Continuity), An-/Verkäufe,
// Rechnungshistorie und die Kommunikations-Timeline.

interface EntryForm {
  channel: string;
  direction: CommunicationDirection;
  subject: string;
  body: string;
  vehicleId: string;
  occurredAt: string;
}

const emptyEntry: EntryForm = { channel: "TELEFON", direction: "AUSGANG", subject: "", body: "", vehicleId: "", occurredAt: "" };

export default function Kundendetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntry);
  const [pageError, setPageError] = useState<string | null>(null);

  const { data: contact, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: () => api<ContactDetail>(`/contacts/${id}`),
    enabled: !!id,
  });

  const { data: communications, isLoading: communicationsLoading } = useQuery({
    queryKey: ["communications", id],
    queryFn: () => api<CommunicationEntry[]>(`/contacts/${id}/communications`),
    enabled: !!id,
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<{ id: string; make: string; model: string; status: string }[]>("/vehicles"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["contact", id] });
    void queryClient.invalidateQueries({ queryKey: ["communications", id] });
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  const addEntryMutation = useMutation({
    mutationFn: () =>
      api(`/contacts/${id}/communications`, {
        method: "POST",
        body: JSON.stringify({
          channel: entryForm.channel,
          direction: entryForm.direction,
          subject: entryForm.subject || null,
          body: entryForm.body || null,
          vehicleId: entryForm.vehicleId || null,
          occurredAt: entryForm.occurredAt || null,
        }),
      }),
    onSuccess: () => {
      setEntryModalOpen(false);
      setEntryForm(emptyEntry);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: string) => api(`/communications/${entryId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  function submitEntry(event: FormEvent) {
    event.preventDefault();
    setPageError(null);
    addEntryMutation.mutate();
  }

  function invoiceOpen(invoice: CustomerInvoiceInfo): number | null {
    if (invoice.isCredit || invoice.totalAmount == null) return null;
    const paid = (contact?.payments ?? [])
      .filter((p) => p.saleId === invoice.saleId && p.direction === "EINGANG")
      .reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, invoice.totalAmount - paid);
  }

  if (isLoading || !contact) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner label="Kunde wird geladen …" />
      </div>
    );
  }

  const phone = contact.phone ? `tel:${contact.phone.replace(/\s/g, "")}` : null;
  const mobile = contact.mobile ? `tel:${contact.mobile.replace(/\s/g, "")}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={() => navigate("/kunden")} className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Kunden
          </button>
          <h1 className="text-2xl font-semibold text-slate-900">{contact.displayName}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {CONTACT_TYPE_LABELS[contact.type]} · Kunde seit {formatDate(contact.createdAt)}
          </p>
        </div>
        <Button onClick={() => { setPageError(null); setEntryModalOpen(true); }}>
          <Plus size={16} /> Kommunikation erfassen
        </Button>
      </div>

      {pageError ? <Alert>{pageError}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Stammdaten + Klick-Kontakte */}
        <Card className="p-5">
          <CardHeader title="Kontakt" description="Direkt klickbar: Anrufen, E-Mail, WhatsApp." />
          <div className="mt-2 space-y-2 text-sm">
            {contact.email ? (
              <p className="flex items-center gap-2">
                <Mail size={14} className="text-slate-400" />
                <a href={`mailto:${contact.email}`} className="text-slate-800 hover:underline">{contact.email}</a>
              </p>
            ) : null}
            {contact.mobile ? (
              <p className="flex items-center gap-2">
                <a href={mobile ?? "#"} className="inline-flex items-center gap-2 text-slate-800 hover:underline">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <MessageCircle size={12} />
                  </span>
                  {contact.mobile}
                </a>
                <a href={whatsappLink(contact.mobile)} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">
                  WhatsApp
                </a>
              </p>
            ) : null}
            {contact.phone ? (
              <p className="flex items-center gap-2">
                <a href={phone ?? "#"} className="text-slate-800 hover:underline">☎ {contact.phone}</a>
              </p>
            ) : null}
            {!contact.email && !contact.mobile && !contact.phone ? <p className="text-slate-400">Keine Kontaktdaten erfasst.</p> : null}
            <p className="text-slate-600">{[contact.street, [contact.zip, contact.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Adresse offen"}</p>
            {contact.notes ? <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{contact.notes}</p> : null}
          </div>
        </Card>

        {/* An-/Verkäufe */}
        <Card className="p-5">
          <CardHeader title="An-/Verkäufe" description={`${contact.dealCount} Vorgänge`} />
          <div className="mt-2 space-y-1.5 text-sm">
            {contact.purchasesAsSeller.map((purchase) => (
              <Link key={purchase.id} to={`/fahrzeuge/${purchase.vehicle?.id ?? ""}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <span className="text-slate-700">
                  Verkauf an uns: {purchase.vehicle ? `${purchase.vehicle.make} ${purchase.vehicle.model}` : "—"}
                </span>
                <span className="text-slate-500">{chf(purchase.purchasePrice)}</span>
              </Link>
            ))}
            {contact.salesAsBuyer.map((sale) => (
              <Link key={sale.id} to={`/fahrzeuge/${sale.vehicle?.id ?? ""}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <span className="text-slate-700">
                  Kauf von uns: {sale.vehicle ? `${sale.vehicle.make} ${sale.vehicle.model}` : "—"}{" "}
                  <Badge className="ml-1 bg-slate-100 text-slate-600 ring-slate-200">{SALE_STATUS_LABELS[sale.status]}</Badge>
                </span>
                <span className="text-slate-500">{chf(sale.salePrice)}</span>
              </Link>
            ))}
            {contact.dealCount === 0 ? <p className="text-slate-400">Noch keine Vorgänge.</p> : null}
          </div>
        </Card>

        {/* Rechnungshistorie */}
        <Card className="p-5">
          <CardHeader title="Rechnungen & Zahlungen" description="Historie über alle Verkaufsvorgänge." />
          <div className="mt-2 space-y-2 text-sm">
            {contact.invoices.length === 0 ? (
              <p className="text-slate-400">Noch keine Rechnungen.</p>
            ) : (
              contact.invoices.map((invoice) => {
                const open = invoiceOpen(invoice);
                return (
                  <div key={invoice.id} className="rounded-lg border border-slate-100 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        {invoice.isCredit ? "Gutschrift" : "Rechnung"} {invoice.number}
                      </span>
                      <Badge className={`${INVOICE_STATUS_STYLES[invoice.status]} ring-slate-200`}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {invoice.vehicle ? `${invoice.vehicle.make} ${invoice.vehicle.model} · ` : ""}
                      {formatDate(invoice.issuedAt)} · {chf(invoice.totalAmount)}
                      {invoice.reminderLevel ? ` · Mahnstufe ${REMINDER_LEVEL_LABELS[invoice.reminderLevel]}` : ""}
                    </p>
                    {!invoice.isCredit && open != null && open > 0 ? (
                      <p className="text-xs font-semibold text-amber-700">Offen: {chf(open)}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => apiDownload(`/invoices/${invoice.id}/pdf`, `${invoice.number}.pdf`)}
                      className="mt-1 text-xs text-slate-500 hover:text-slate-800 hover:underline"
                    >
                      PDF herunterladen
                    </button>
                  </div>
                );
              })
            )}
            {contact.payments.filter((p) => p.direction === "EINGANG").length ? (
              <div className="border-t border-slate-100 pt-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Zahlungen</p>
                {contact.payments
                  .filter((p) => p.direction === "EINGANG")
                  .map((p) => (
                    <p key={p.id} className="text-xs text-slate-600">
                      {formatDate(p.paidAt)} · + {chf(p.amount)} · {PAYMENT_METHOD_LABELS[p.method ?? ""] ?? p.method}
                      {p.vehicle ? ` (${p.vehicle.make} ${p.vehicle.model})` : ""}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Kommunikations-Timeline */}
      <Card>
        <CardHeader
          title="Kommunikations-Historie"
          description="Alles zu diesem Kunden: E-Mails, Web-Formular, Anrufe/WhatsApp (manuell protokolliert) und Fahrzeug-Anfragen."
        />
        {communicationsLoading ? (
          <div className="px-5 py-8">
            <Spinner label="Historie wird geladen …" />
          </div>
        ) : (communications ?? []).length === 0 ? (
          <EmptyState
            title="Noch keine Kommunikation"
            description="Manuelle Einträge, eingehende E-Mails und Anfragen landen automatisch in dieser Timeline."
            action={
              <Button size="sm" onClick={() => setEntryModalOpen(true)}>
                <Plus size={14} /> Ersten Eintrag erfassen
              </Button>
            }
          />
        ) : (
          <ol className="relative border-l border-slate-200 ml-8 mr-5 py-4">
            {(communications ?? []).map((entry) => (
              <li key={entry.id} className="mb-5 ml-6">
                <span
                  className={`absolute -left-[9px] mt-1.5 grid h-[17px] w-[17px] place-items-center rounded-full ring-2 ring-white ${
                    entry.direction === "EINGANG" ? "bg-sky-500" : entry.direction === "AUSGANG" ? "bg-indigo-500" : "bg-slate-400"
                  }`}
                >
                  {entry.direction === "EINGANG" ? (
                    <ArrowLeftSquare size={10} className="text-white" />
                  ) : entry.direction === "AUSGANG" ? (
                    <ArrowRightSquare size={10} className="text-white" />
                  ) : null}
                </span>
                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={COMMUNICATION_DIRECTION_STYLES[entry.direction]}>{COMMUNICATION_DIRECTION_LABELS[entry.direction]}</Badge>
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{PURCHASE_CHANNEL_LABELS[entry.channel]}</Badge>
                    <Badge className="bg-white text-slate-400 ring-slate-200">{COMMUNICATION_SOURCE_LABELS[entry.source]}</Badge>
                    {entry.vehicleTitle ? (
                      <Link to={`/fahrzeuge/${entry.vehicleId}`} className="text-xs text-slate-500 hover:underline">
                        {entry.vehicleTitle}
                      </Link>
                    ) : null}
                    <span className="ml-auto text-[11px] text-slate-400">{formatDateTime(entry.occurredAt)}</span>
                    <button
                      type="button"
                      onClick={() => deleteEntryMutation.mutate(entry.id)}
                      title="Eintrag löschen"
                      className="text-slate-300 hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {entry.subject ? <p className="mt-1 text-sm font-semibold text-slate-800">{entry.subject}</p> : null}
                  {entry.body ? <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{entry.body}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Kommunikation erfassen */}
      <Modal
        open={entryModalOpen}
        title="Kommunikation erfassen"
        description="Anruf, WhatsApp, Gesprächsnotiz — was mit dem Kunden besprochen wurde."
        onClose={() => setEntryModalOpen(false)}
      >
        <form onSubmit={submitEntry} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kanal">
              <Select value={entryForm.channel} onChange={(e) => setEntryForm({ ...entryForm, channel: e.target.value })}>
                {Object.entries(PURCHASE_CHANNEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Richtung">
              <Select value={entryForm.direction} onChange={(e) => setEntryForm({ ...entryForm, direction: e.target.value as CommunicationDirection })}>
                {Object.entries(COMMUNICATION_DIRECTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Datum">
              <Input type="date" value={entryForm.occurredAt} onChange={(e) => setEntryForm({ ...entryForm, occurredAt: e.target.value })} />
            </Field>
          </div>
          <Field label="Betreff">
            <Input value={entryForm.subject} onChange={(e) => setEntryForm({ ...entryForm, subject: e.target.value })} placeholder="z. B. Telefonat: Preis verhandelt" />
          </Field>
          <Field label="Notiz">
            <textarea
              rows={3}
              value={entryForm.body}
              onChange={(e) => setEntryForm({ ...entryForm, body: e.target.value })}
              placeholder="Was wurde besprochen / ausgemacht?"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <Field label="Fahrzeug (optional)">
            <Select value={entryForm.vehicleId} onChange={(e) => setEntryForm({ ...entryForm, vehicleId: e.target.value })}>
              <option value="">– Kein Fahrzeugbezug –</option>
              {(vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.make} {v.model}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEntryModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={addEntryMutation.isPending}>
              <Pencil size={14} /> {addEntryMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
