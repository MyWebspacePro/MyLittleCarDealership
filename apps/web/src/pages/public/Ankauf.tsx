import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, CheckCircle2, FileUp, Send, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

// Öffentliches Ankauffsformular (Phase F): Erstkontakt mit Fotos und
// Fahrzeugausweis — landet direkt im Posteingang des internen Systems.
// Honeypot-Feld («Firma») und nDSG-Einwilligung sind Pflicht.

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function Ankauf() {
  const [params] = useSearchParams();
  const interesse = params.get("interesse") ?? "";
  const [form, setForm] = useState({
    sellerName: "",
    sellerPhone: "",
    sellerEmail: "",
    make: "",
    model: "",
    variant: "",
    year: "",
    mileageKm: "",
    askingPrice: "",
    message: interesse ? `Ich interessiere mich für Ihre ${interesse} — würde gern mein aktuelles Auto eintauschen.` : "",
    consent: false,
  });
  const [photos, setPhotos] = useState<File[]>([]);
  const [ausweis, setAusweis] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const ok = Array.from(files).filter((f) => f.size <= MAX_FILE_BYTES);
    setPhotos((prev) => [...prev, ...ok].slice(0, 8));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("sellerName", form.sellerName);
      body.append("sellerPhone", form.sellerPhone);
      if (form.sellerEmail) body.append("sellerEmail", form.sellerEmail);
      body.append("make", form.make);
      body.append("model", form.model);
      if (form.variant) body.append("variant", form.variant);
      if (form.year) body.append("year", form.year);
      if (form.mileageKm) body.append("mileageKm", form.mileageKm);
      if (form.askingPrice) body.append("askingPrice", form.askingPrice);
      if (form.message) body.append("message", form.message);
      body.append("consent", String(form.consent));
      body.append("company", honeypotRef.current?.value ?? ""); // Honeypot: muss leer sein
      for (const photo of photos) body.append("photos", photo);
      if (ausweis) body.append("fahrzeugausweis", ausweis);
      await api("/public/leads", { method: "POST", body });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Senden fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
        <h1 className="mt-3 text-xl font-semibold text-slate-900">Danke, Anfrage eingegangen!</h1>
        <p className="mt-2 text-sm text-slate-600">
          Wir melden uns schnellstmöglich unter {form.sellerPhone}. Ihre Fotos und der Fahrzeugausweis sind sicher bei uns eingegangen.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Verkaufen Sie uns Ihr Auto</h1>
        <p className="mt-1 text-sm text-slate-500">
          Füllen Sie das Formular aus, laden Sie ein paar Fotos hoch (optional der Fahrzeugausweis) — wir schauen es uns an und
          unterbreiten Ihnen schnell ein unverbindliches Angebot.
        </p>
      </header>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Ihr Name *</span>
            <input required value={form.sellerName} onChange={set("sellerName")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Telefon *</span>
            <input required type="tel" value={form.sellerPhone} onChange={set("sellerPhone")} placeholder="079 …" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">E-Mail</span>
            <input type="email" value={form.sellerEmail} onChange={set("sellerEmail")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {/* Honeypot — Menschen sehen das Feld nicht, Bots füllen es */}
          <input ref={honeypotRef} name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Marke *</span>
            <input required value={form.make} onChange={set("make")} placeholder="Volkswagen" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Modell *</span>
            <input required value={form.model} onChange={set("model")} placeholder="Golf" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Typ / Ausstattung</span>
            <input value={form.variant} onChange={set("variant")} placeholder="1.5 eTSI Life" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Jahrgang (EZ)</span>
            <input type="number" min={1950} max={new Date().getFullYear() + 1} value={form.year} onChange={set("year")} placeholder="2021" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Kilometerstand</span>
            <input type="number" min={0} value={form.mileageKm} onChange={set("mileageKm")} placeholder="45300" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Preisvorstellung (CHF)</span>
            <input type="number" min={0} value={form.askingPrice} onChange={set("askingPrice")} placeholder="12000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Nachricht</span>
          <textarea
            rows={4}
            value={form.message}
            onChange={set("message")}
            placeholder="Zustand, Unfälle, MFK-Datum, Serviceheft — alles, was uns weiterhilft."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm transition-colors hover:border-slate-400">
            <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
            <Camera size={20} className="mx-auto text-slate-400" />
            <span className="mt-1.5 block font-medium text-slate-700">Fotos hochladen</span>
            <span className="text-xs text-slate-500">{photos.length ? `${photos.length} gewählt` : "bis zu 8 Bilder, je max. 8 MB"}</span>
          </label>
          <label className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm transition-colors hover:border-slate-400">
            <input
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => setAusweis(e.target.files?.[0] ?? null)}
            />
            <FileUp size={20} className="mx-auto text-slate-400" />
            <span className="mt-1.5 block font-medium text-slate-700">Fahrzeugausweis</span>
            <span className="text-xs text-slate-500">{ausweis ? ausweis.name : "Foto oder PDF, optional"}</span>
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm">
          <input type="checkbox" required checked={form.consent} onChange={set("consent")} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span className="text-slate-600">
            Ich willige ein, dass meine Angaben und Dateien zur Bearbeitung meiner Anfrage gespeichert und ausgewertet werden
            (<a href="/datenschutz" className="text-slate-900 underline">Datenschutzerklärung</a>). Die Einwilligung kann ich jederzeit widerrufen. *
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting || !form.consent}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <Send size={16} /> {submitting ? "Wird gesendet …" : "Anfrage senden"}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck size={12} /> Ihre Daten bleiben im Betrieb und werden nicht weitergegeben.
        </p>
      </form>
    </div>
  );
}
