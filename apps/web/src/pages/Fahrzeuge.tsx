import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import {
  chf,
  formatDate,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_STYLES,
  type VehicleListItem,
  type VehicleStatus,
} from "../lib/types";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Spinner } from "../components/ui";

const emptyForm = {
  make: "",
  model: "",
  variant: "",
  chassisNumber: "",
  firstRegistration: "",
  mileageKm: "",
  fuel: "Benzin",
  transmission: "Automat",
  color: "",
  plates: "",
  targetSalePrice: "",
};

export default function Fahrzeuge() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "ALLE">("ALLE");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<VehicleListItem[]>("/vehicles"),
  });

  const createMutation = useMutation({
    mutationFn: () => api<{ id: string }>("/vehicles", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: async (vehicle) => {
      await queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setModalOpen(false);
      setForm(emptyForm);
      navigate(`/fahrzeuge/${vehicle.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  // Pipeline-Zähler über den ganzen Bestand (unabhängig vom aktuellen Filter).
  const counts = useMemo(() => {
    const c = new Map<VehicleStatus, number>();
    for (const s of VEHICLE_STATUSES) c.set(s, 0);
    for (const v of data ?? []) c.set(v.status, (c.get(v.status) ?? 0) + 1);
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((v) => {
      if (statusFilter !== "ALLE" && v.status !== statusFilter) return false;
      if (!q) return true;
      return [v.make, v.model, v.variant, v.chassisNumber, v.plates]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q));
    });
  }, [data, search, statusFilter]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    createMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fahrzeuge</h1>
          <p className="mt-0.5 text-sm text-slate-500">Vom Erstkontakt bis zum abgeschlossenen Verkauf.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Neues Fahrzeug
        </Button>
      </div>

      {/* Pipeline-Übersicht */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("ALLE")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
            statusFilter === "ALLE" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          Alle ({data?.length ?? 0})
        </button>
        {VEHICLE_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${
              statusFilter === status ? "bg-slate-900 text-white ring-slate-900" : `${VEHICLE_STATUS_STYLES[status]} hover:opacity-80`
            }`}
          >
            {VEHICLE_STATUS_LABELS[status]} ({counts.get(status) ?? 0})
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Bestand"
          description={`${filtered.length} von ${data?.length ?? 0} Fahrzeugen`}
          actions={
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Marke, Modell, Stammnummer, Kennzeichen …"
                className="w-64 pl-9"
              />
            </div>
          }
        />
        {isLoading ? (
          <div className="px-5 py-10">
            <Spinner label="Fahrzeuge werden geladen …" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Keine Fahrzeuge gefunden"
            description="Lege ein Fahrzeug an oder passe Suche und Filter an."
            action={
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus size={14} /> Neues Fahrzeug
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-semibold">Fahrzeug</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">EZ</th>
                  <th className="px-3 py-3 font-semibold">km</th>
                  <th className="px-3 py-3 font-semibold">Zielpreis</th>
                  <th className="px-3 py-3 font-semibold">Standtage</th>
                  <th className="px-3 py-3 font-semibold">Ankauf</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <Link to={`/fahrzeuge/${v.id}`} className="font-semibold text-slate-900 hover:underline">
                        {v.make} {v.model}
                      </Link>
                      {v.variant ? <p className="text-xs text-slate-500">{v.variant}</p> : null}
                      {v.plates ? <p className="text-[11px] text-slate-400">{v.plates}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={VEHICLE_STATUS_STYLES[v.status]}>{VEHICLE_STATUS_LABELS[v.status]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(v.firstRegistration)}</td>
                    <td className="px-3 py-3 text-slate-600">{v.mileageKm?.toLocaleString("de-CH") ?? "–"}</td>
                    <td className="px-3 py-3 text-slate-600">{chf(v.targetSalePrice)}</td>
                    <td className="px-3 py-3 text-slate-600">{v.daysInStatus}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {v.purchase ? (
                        <span className="flex flex-col">
                          <span>{chf(v.purchase.purchasePrice ?? v.purchase.recommendedPrice)}</span>
                          <span className="text-[11px] text-slate-400">{v.purchase.sellerName ?? "ohne Verkäufer"}</span>
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {v.as24Url ? (
                        <a
                          href={v.as24Url}
                          target="_blank"
                          rel="noreferrer"
                          title="AutoScout24-Inserat öffnen"
                          className="inline-flex rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <ExternalLink size={15} />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title="Neues Fahrzeug"
        description="Erfasse das Fahrzeug nach dem Erstkontakt — Kalkulation folgt auf der Detailseite."
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marke *">
              <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required />
            </Field>
            <Field label="Modell *">
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
            </Field>
          </div>
          <Field label="Typ / Bezeichnung" hint="z. B. «1.5 eTSI Life DSG»">
            <Input value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stammnummer / CHID">
              <Input value={form.chassisNumber} onChange={(e) => setForm({ ...form, chassisNumber: e.target.value })} />
            </Field>
            <Field label="Erste Inverkehrtsetzung">
              <Input type="date" value={form.firstRegistration} onChange={(e) => setForm({ ...form, firstRegistration: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kilometer">
              <Input type="number" min={0} value={form.mileageKm} onChange={(e) => setForm({ ...form, mileageKm: e.target.value })} />
            </Field>
            <Field label="Treibstoff">
              <Input value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} />
            </Field>
            <Field label="Getriebe">
              <Input value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Farbe">
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </Field>
            <Field label="Kennzeichen">
              <Input value={form.plates} onChange={(e) => setForm({ ...form, plates: e.target.value })} />
            </Field>
            <Field label="Zielverkaufspreis (CHF)">
              <Input
                type="number"
                min={0}
                step={100}
                value={form.targetSalePrice}
                onChange={(e) => setForm({ ...form, targetSalePrice: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Speichern …" : "Anlegen"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
