import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, ExternalLink, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_STYLES,
  APPOINTMENT_TYPE_LABELS,
  formatDateTime,
  type Appointment,
  type AppointmentStatus,
} from "../lib/types";
import { Alert, Badge, Card, CardHeader, EmptyState, Spinner } from "../components/ui";

// Kalender: kommende Termine, gruppiert nach Tag. Besichtigungen, Probefahrten
// und Werkstatt-Termine aus allen Fahrzeugen — die Schaltzentrale auf einen Blick.
export default function Kalender() {
  const queryClient = useQueryClient();
  const [pageError, setPageError] = useState<string | null>(null);

  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["appointments", from.toISOString()],
    queryFn: () => api<Appointment[]>(`/appointments?from=${from.toISOString()}`),
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
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <CalendarDays size={20} className="text-amber-500" /> Kalender
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Besichtigungen, Probefahrten, Rückrufe und Werkstatt-Termine.</p>
      </div>

      {pageError ? <Alert>{pageError}</Alert> : null}

      {isLoading ? (
        <div className="px-5 py-10">
          <Spinner label="Termine werden geladen …" />
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState title="Keine Termine ab heute" description="Termine legst du auf der Fahrzeug-Detailseite im Tab «Termine» an." />
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
    </div>
  );
}
