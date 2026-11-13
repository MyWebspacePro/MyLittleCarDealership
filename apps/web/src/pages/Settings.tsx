import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError, api } from "../lib/api";
import { Alert, Button, Card, CardHeader, Field, Input, Spinner } from "../components/ui";
import type { Setting } from "../lib/types";

const schema = z.object({
  companyName: z.string().min(1, "Firmenname fehlt").max(120),
  addressLine: z.string().max(200),
  zip: z.string().max(20),
  city: z.string().max(100),
  phone: z.string().max(50),
  email: z.string().max(200),
  website: z.string().max(200),
  vatNumber: z.string().max(50),
  vatRateStandard: z.number({ invalid_type_error: "Zahl eingeben" }).min(0).max(100),
  vatRateReduced: z.number({ invalid_type_error: "Zahl eingeben" }).min(0).max(100),
  iban: z.string().max(50),
  bankName: z.string().max(100),
  qrIban: z.string().max(34),
  as24PortalUrl: z.string().max(300),
  warrantyText: z.string().max(4000),
  targetProfitDefault: z.number({ invalid_type_error: "Zahl eingeben" }).min(0),
  paymentDays: z.number({ invalid_type_error: "Zahl eingeben" }).int().min(0).max(365),
});
type Values = z.infer<typeof schema>;

const FALLBACK: Values = {
  companyName: "",
  addressLine: "",
  zip: "",
  city: "",
  phone: "",
  email: "",
  website: "",
  vatNumber: "",
  vatRateStandard: 8.1,
  vatRateReduced: 2.6,
  iban: "",
  bankName: "",
  qrIban: "",
  as24PortalUrl: "",
  warrantyText: "",
  targetProfitDefault: 0,
  paymentDays: 30,
};

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Setting>("/settings"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: FALLBACK });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (values: Values) => api<Setting>("/settings", { method: "PUT", body: JSON.stringify(values) }),
    onSuccess: (result) => {
      queryClient.setQueryData(["settings"], result);
      reset(result);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Einstellungen</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stammdaten des Betriebs — erscheinen später auf Rechnungen und Verträgen.
        </p>
      </header>

      {saved ? <Alert kind="success">Einstellungen gespeichert.</Alert> : null}
      {save.isError ? (
        <Alert>{save.error instanceof ApiError ? save.error.message : "Speichern fehlgeschlagen."}</Alert>
      ) : null}
      {isError ? <Alert>Einstellungen konnten nicht geladen werden.</Alert> : null}
      {!isAdmin ? (
        <Alert kind="info">Änderungen sind nur durch die Administration möglich.</Alert>
      ) : null}

      {isLoading ? (
        <Spinner />
      ) : (
        <form onSubmit={handleSubmit((values) => save.mutate(values))} className="space-y-6">
          <fieldset disabled={!isAdmin} className="space-y-6">
            <Card>
              <CardHeader title="Betrieb" description="Offizielle Bezeichnung und Kontakt." />
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Firmenname" error={errors.companyName?.message}>
                    <Input {...register("companyName")} />
                  </Field>
                </div>
                <Field label="MWST-Nummer" error={errors.vatNumber?.message}>
                  <Input {...register("vatNumber")} placeholder="CHE-123.456.789 MWST" />
                </Field>
                <Field label="Telefon" error={errors.phone?.message}>
                  <Input {...register("phone")} />
                </Field>
                <Field label="E-Mail" error={errors.email?.message}>
                  <Input type="email" {...register("email")} />
                </Field>
                <Field label="Website" error={errors.website?.message}>
                  <Input {...register("website")} placeholder="https://…" />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader title="Adresse" />
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-6">
                <div className="sm:col-span-6">
                  <Field label="Strasse / Nr." error={errors.addressLine?.message}>
                    <Input {...register("addressLine")} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="PLZ" error={errors.zip?.message}>
                    <Input {...register("zip")} />
                  </Field>
                </div>
                <div className="sm:col-span-4">
                  <Field label="Ort" error={errors.city?.message}>
                    <Input {...register("city")} />
                  </Field>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Steuer & Zahlung" description="Standardwerte für Offerten und Rechnungen." />
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-3">
                <Field label="MWST Standard (%)" error={errors.vatRateStandard?.message}>
                  <Input type="number" step="0.1" min="0" max="100" {...register("vatRateStandard", { valueAsNumber: true })} />
                </Field>
                <Field label="MWST reduziert (%)" error={errors.vatRateReduced?.message}>
                  <Input type="number" step="0.1" min="0" max="100" {...register("vatRateReduced", { valueAsNumber: true })} />
                </Field>
                <Field label="Zahlungsziel (Tage)" error={errors.paymentDays?.message}>
                  <Input type="number" step="1" min="0" max="365" {...register("paymentDays", { valueAsNumber: true })} />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader title="Bank & QR-Rechnung" description="Auszahlungen und der Schweizer QR-Rechnungszahlteil." />
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                <Field label="IBAN" error={errors.iban?.message}>
                  <Input {...register("iban")} placeholder="CH00 0000 0000 0000 0000 0" />
                </Field>
                <Field label="Bank" error={errors.bankName?.message}>
                  <Input {...register("bankName")} />
                </Field>
                <Field
                  label="QR-IBAN"
                  hint="Bei der Bank beantragen (beginnt mit CH…3…) — erst damit erscheint der QR-Zahlteil auf Rechnungen und Mahnungen."
                  error={errors.qrIban?.message}
                >
                  <Input {...register("qrIban")} placeholder="CHxx 3xxxx xxxx xxxx xxxx x" />
                </Field>
                <Field label="AutoScout24-Händlerportal" hint="URL zum Manager — als Klick-Link im Verkauf-Tab">
                  <Input {...register("as24PortalUrl")} placeholder="https://www.autoscout24.ch/manager" />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader title="Kalkulation & Verträge" description="Standardwerte für Ankaufsempfehlung und Vertrags-PDFs." />
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
                <Field label="Standard-Zielgewinn (CHF)" hint="Flosse in der Ankaufs-Empfehlung, wenn kein Zielgewinn erfasst ist">
                  <Input type="number" min={0} step={100} {...register("targetProfitDefault", { valueAsNumber: true })} />
                </Field>
                <Field label="Gewährleistungs-Text" hint="§ 4 im Kaufvertrag — leer = Standardtext «wie besichtigt»">
                  <textarea
                    rows={4}
                    {...register("warrantyText")}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </Field>
              </div>
            </Card>
          </fieldset>

          {isAdmin ? (
            <div className="flex items-center justify-end gap-3">
              {isDirty ? <span className="text-xs text-slate-500">Ungespeicherte Änderungen</span> : null}
              <Button type="submit" disabled={save.isPending}>
                <Save size={16} />
                {save.isPending ? "Speichern …" : "Speichern"}
              </Button>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}