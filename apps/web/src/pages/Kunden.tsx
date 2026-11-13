import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { CONTACT_TYPE_LABELS, type Contact, type ContactListItem, type ContactType } from "../lib/types";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Spinner } from "../components/ui";

type FormState = {
  type: ContactType;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  zip: string;
  city: string;
  notes: string;
};

const emptyForm: FormState = {
  type: "PRIVAT",
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  mobile: "",
  street: "",
  zip: "",
  city: "",
  notes: "",
};

function toForm(c: Contact): FormState {
  return {
    type: c.type,
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    companyName: c.companyName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
    street: c.street ?? "",
    zip: c.zip ?? "",
    city: c.city ?? "",
    notes: c.notes ?? "",
  };
}

export default function Kunden() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContactType | "ALLE">("ALLE");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api<ContactListItem[]>("/contacts"),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; body: FormState }) =>
      payload.id
        ? api<Contact>(`/contacts/${payload.id}`, { method: "PUT", body: JSON.stringify(payload.body) })
        : api<Contact>("/contacts", { method: "POST", body: JSON.stringify(payload.body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      closeModals();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (err: Error) => setDeleteError(err.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (typeFilter !== "ALLE" && c.type !== typeFilter) return false;
      if (!q) return true;
      return [c.displayName, c.email, c.phone, c.mobile, c.city, c.companyName]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(q));
    });
  }, [data, search, typeFilter]);

  function openCreate() {
    setForm(emptyForm);
    setError(null);
    setCreating(true);
  }

  function openEdit(c: ContactListItem) {
    setForm(toForm(c));
    setError(null);
    setEditing(c);
  }

  function closeModals() {
    setCreating(false);
    setEditing(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    saveMutation.mutate({ id: editing?.id, body: form });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kunden</h1>
          <p className="mt-0.5 text-sm text-slate-500">Verkäufer, Käufer und Interessenten — privat und geschäftlich.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Neuer Kunde
        </Button>
      </div>

      <Card>
        <CardHeader
          title="Kontakte"
          description={`${filtered.length} von ${data?.length ?? 0} Einträgen`}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTypeFilter("ALLE")}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                  typeFilter === "ALLE" ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                Alle
              </button>
              {(["PRIVAT", "FIRMA"] as ContactType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(typeFilter === t ? "ALLE" : t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                    typeFilter === t ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"
                  }`}
                >
                  {CONTACT_TYPE_LABELS[t]}
                </button>
              ))}
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, E-Mail, Ort …" className="w-56 pl-9" />
              </div>
            </div>
          }
        />
        {isLoading ? (
          <div className="px-5 py-10">
            <Spinner label="Kontakte werden geladen …" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Keine Kontakte gefunden"
            description="Lege einen Kunden an oder passe Suche und Filter an."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} /> Neuer Kunde
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Typ</th>
                  <th className="px-3 py-3 font-semibold">Kontakt</th>
                  <th className="px-3 py-3 font-semibold">Ort</th>
                  <th className="px-3 py-3 font-semibold">Fälle</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{c.displayName}</p>
                      {c.type === "PRIVAT" && c.companyName ? <p className="text-xs text-slate-500">{c.companyName}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={c.type === "FIRMA" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-slate-100 text-slate-600 ring-slate-200"}>
                        {CONTACT_TYPE_LABELS[c.type]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col text-slate-600">
                        {c.mobile ? <span>{c.mobile}</span> : null}
                        {c.phone ? <span>{c.phone}</span> : null}
                        {c.email ? <a href={`mailto:${c.email}`} className="text-xs text-slate-500 hover:underline">{c.email}</a> : null}
                        {!c.mobile && !c.phone && !c.email ? <span className="text-slate-400">–</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{[c.zip, c.city].filter(Boolean).join(" ") || "–"}</td>
                    <td className="px-3 py-3 text-slate-600">
                      <span className="text-xs">
                        {c.dealCount} An-/Verkäufe · {c.inquiryCount} Anfragen
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          title="Bearbeiten"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(c);
                          }}
                          title="Löschen"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Anlegen / Bearbeiten */}
      <Modal
        open={creating || editing != null}
        title={editing ? "Kontakt bearbeiten" : "Neuer Kunde"}
        description={editing ? undefined : "Privatkunde oder Firma — beide erscheinen bei An- und Verkäufen."}
        onClose={closeModals}
      >
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex gap-2">
            {(["PRIVAT", "FIRMA"] as ContactType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  form.type === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {CONTACT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {form.type === "FIRMA" ? (
            <Field label="Firmenname *">
              <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vorname *">
                <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </Field>
              <Field label="Nachname *">
                <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Mobil">
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="E-Mail">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Strasse">
              <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
            </Field>
            <Field label="PLZ">
              <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            </Field>
            <Field label="Ort">
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
          </div>
          <Field label="Notizen">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModals}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Löschen bestätigen */}
      <Modal
        open={deleteTarget != null}
        title="Kontakt löschen?"
        description="Das funktioniert nur, wenn der Kontakt in keinen An-/Verkäufen oder Anfragen verwendet wird."
        onClose={() => setDeleteTarget(null)}
      >
        {deleteError ? <Alert>{deleteError}</Alert> : null}
        <p className="text-sm text-slate-600">
          «{deleteTarget?.displayName}» wirklich löschen?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Abbrechen
          </Button>
          <Button variant="danger" disabled={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
            {deleteMutation.isPending ? "Löschen …" : "Löschen"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
