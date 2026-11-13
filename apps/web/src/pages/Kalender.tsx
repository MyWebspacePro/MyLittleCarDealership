import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_STYLES,
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABELS,
  formatDateTime,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
  type ContactListItem,
} from "../lib/types";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Spinner } from "../components/ui";

// Kalender: kommende Termine, gruppiert nach Tag — und Termine direkt hier
// anlegen/bearbeiten (Probefahrt, Besichtigung, Rückruf …), inkl.
// Fahrzeug-Auswahl. Die Termin-Daten hängen am Fahrzeug, deshalb verlinkt
// jeder Termin dorthin.

interface TerminForm {
  type: AppointmentType;
  vehicleId: string;
  contactId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  notes: string;
}

const emptyTermin: TerminForm = { type: "PROBEFAHRT", vehicleId: "", contactId: "", title: "", startsAt: "", endsAt: "", notes: "" };

export default function Kalender() {
  const queryClient = useQueryClient();
  const [pageError, setPageError] = useState<string | null>(null);
  const [terminModalOpen, setTerminModalOpen] = useState(false);
  const [terminEditing, setTerminEditing] = useState<Appointment | null>(null);
  const [terminForm, setTerminForm] = useState<TerminForm>(emptyTermin);

  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", from.toISOString()],
    queryFn: () => api<Appointment[]>(`/appointments?from=${from.toISOString()}`),
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<{ id: string; make: string; model: string; status: string }[]>("/vehicles"),
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api<ContactListItem[]>("/contacts"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["vehicle"] });
  }

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: AppointmentStatus }) =>
      api(`/appointments/${payload.id}`, { method: "PUT", body: JSON.stringify({ status: payload.status }) }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (err: Error) => setPageError(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { id: string | null; body: Record<string, unknown> }) =>
      payload.id
        ? api(`/appointments/${payload.id}`, { method: "PUT", body: JSON.stringify(payload.body) })
        : api("/appointments", { method: "POST", body: JSON.stringify(payload.body) }),
    onSuccess: () => {
      setTerminModalOpen(false);
      setTerminEditing(null);
      invalidate();
    },
    onError: (err: Error) => setPageError(err.message),
  });

  function openCreate() {
    setPageError(null);
    setTerminEditing(null);
    setTerminForm(emptyTermin);
    setTerminModalOpen(true);
  }

  function openEdit(a: Appointment) {
    setPageError(null);
    setTerminEditing(a);
    setTerminForm({
      type: a.type,
      vehicleId: a.vehicleId ?? "",
      contactId: a.contactId ?? "",
      title: a.title,
      startsAt: a.startsAt.slice(0, 16),
      endsAt: a.endsAt ? a.endsAt.slice(0, 16) : "",
      notes: a.notes ?? "",
    });
    setTerminModalOpen(true);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of data ?? []) {
      const day = new Date(a.startsAt);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [data]);

  function dayLabel(key: string): string {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y!, m! - 1, d!);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
    const label = new Intl.DateTimeFormat("de-CH", { weekday: "long", day: "numeric", month: "long" }).format(date);
    if (diff === 0) return `Heute · ${label}`;
    if (diff === 1) return `Morgen · ${label}`;
    return label;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <CalendarDays size={20} className="text-amber-500" /> Kalender
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Besichtigungen, Probefahrten, Rückrufe und Werkstatt-Termine — direkt hier pflegen.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Termin anlegen
        </Button>
      </div>

      {pageError ? <Alert>{pageError}</Alert> : null}

      {isLoading ? (
        <div className="px-5 py-10">
          <Spinner label="Termine werden geladen …" />
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            title="Keine Termine ab heute"
            description="Lege hier direkt Probefahrten, Besichtigungen oder Rückrufe an — oder auf der Fahrzeug-Detailseite im Tab «Termine»."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} /> Termin anlegen
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, items]) => (
            <Card key={day}>
              <CardHeader title={dayLabel(day)} description={`${items.length} Termin(e)`} />
              <div className="divide-y divide-slate-100">
                {items.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{APPOINTMENT_TYPE_LABELS[a.type]}</Badge>
                        <Badge className={APPOINTMENT_STATUS_STYLES[a.status]}>{APPOINTMENT_STATUS_LABELS[a.status]}</Badge>
                        <span className="text-sm font-medium text-slate-800">{formatDateTime(a.startsAt)}</span>
                      </div>
                      <p className="mt-0.5 font-semibold text-slate-900">{a.title}</p>
                      {a.vehicle ? (
                        <Link to={`/fahrzeuge/${a.vehicle.id}`} className="text-xs text-blue-600 hover:underline">
                          {a.vehicle.make} {a.vehicle.model}
                        </Link>
                      ) : null}
                      {a.contact ? <span className="text-xs text-slate-500"> · {a.contact.displayName}</span> : null}
                      {a.notes ? <p className="text-xs text-slate-500">{a.notes}</p> : null}
                    </div>
                    <div className="flex gap-1.5">
                      {a.status === "GEPLANT" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => statusMutation.mutate({ id: a.id, status: "ERLEDIGT" })}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            <Check size={12} /> Erledigt
                          </button>
                          <button
                            type="button"
                            onClick={() => statusMutation.mutate({ id: a.id, status: "ABGESAGT" })}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
                          >
                            <X size={12} /> Absagen
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        title="Bearbeiten"
                        onClick={() => openEdit(a)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil size={14} />
                      </button>
                      {a.vehicle ? (
                        <Link
                          to={`/fahrzeuge/${a.vehicle.id}`}
                          title="Zum Fahrzeug"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <ExternalLink size={14} />
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        title="Löschen"
                        onClick={() => deleteMutation.mutate(a.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Termin anlegen / bearbeiten */}
      <Modal
        open={terminModalOpen}
        title={terminEditing ? "Termin bearbeiten" : "Termin anlegen"}
        description="Probefahrt, Besichtigung, Rückruf oder Werkstatt — verknüpft mit einem Fahrzeug."
        onClose={() => setTerminModalOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPageError(null);
            saveMutation.mutate({
              id: terminEditing?.id ?? null,
              body: {
                type: terminForm.type,
                vehicleId: terminForm.vehicleId || null,
                contactId: terminForm.contactId || null,
                title: terminForm.title,
                startsAt: terminForm.startsAt,
                endsAt: terminForm.endsAt || null,
                notes: terminForm.notes || null,
              },
            });
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Typ">
              <Select value={terminForm.type} onChange={(e) => setTerminForm({ ...terminForm, type: e.target.value as AppointmentType })}>
                {APPOINTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{APPOINTMENT_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Fahrzeug">
              <Select value={terminForm.vehicleId} onChange={(e) => setTerminForm({ ...terminForm, vehicleId: e.target.value })}>
                <option value="">– Kein Fahrzeugbezug –</option>
                {(vehicles ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.make} {v.model}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Titel">
            <Input value={terminForm.title} onChange={(e) => setTerminForm({ ...terminForm, title: e.target.value })} placeholder="z. B. Probefahrt Golf (Familie Hofer)" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input type="datetime-local" value={terminForm.startsAt} onChange={(e) => setTerminForm({ ...terminForm, startsAt: e.target.value })} required />
            </Field>
            <Field label="Ende (optional)">
              <Input type="datetime-local" value={terminForm.endsAt} onChange={(e) => setTerminForm({ ...terminForm, endsAt: e.target.value })} />
            </Field>
          </div>
          <Field label="Kontaktperson (optional)">
            <Select value={terminForm.contactId} onChange={(e) => setTerminForm({ ...terminForm, contactId: e.target.value })}>
              <option value="">– Keine –</option>
              {(contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.displayName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notizen">
            <textarea
              rows={2}
              value={terminForm.notes}
              onChange={(e) => setTerminForm({ ...terminForm, notes: e.target.value })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setTerminModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
