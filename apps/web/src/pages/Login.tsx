import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Car, ShieldCheck, Users, Wallet } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Alert, Button, Field, Input } from "../components/ui";

const schema = z.object({
  email: z.string().min(1, "E-Mail eingeben").email("Gültige E-Mail eingeben"),
  password: z.string().min(1, "Passwort eingeben"),
});
type Values = z.infer<typeof schema>;

const features = [
  { icon: Users, title: "Team & Rollen", text: "Verkauf, Buchhaltung und Geschäftsleitung sauber getrennt." },
  { icon: ShieldCheck, title: "Sicher im Browser", text: "Kurzlebige Sitzungen, httpOnly-Cookies, lückenloses Audit." },
  { icon: Wallet, title: "Stammdaten im Griff", text: "Firma, MWST, Bank und Zahlungsziele zentral hinterlegt." },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setError("");
    try {
      await login(values.email.trim(), values.password);
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login fehlgeschlagen");
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Markenbereich */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-950 p-12 lg:flex">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20">
            <Car size={24} strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">MyLittleCarDealership</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Occasionshandel</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight text-white">
            Der Occasionshandel.
            <br />
            <span className="text-amber-400">Aufgeräumt.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Fahrzeuge, Kunden und Verkäufe an einem Ort — ohne Zettelwirtschaft, ohne
            Excel-Chaos. Die Software für freie Händler, die lieber Autos verkauft als
            Formulare ausfüllt.
          </p>

          <ul className="mt-10 space-y-5">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-amber-400 ring-1 ring-white/10">
                  <Icon size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">{title}</p>
                  <p className="text-xs leading-relaxed text-slate-500">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-600">
          © {new Date().getFullYear()} MyLittleCarDealership · Made in Switzerland
        </p>
      </div>

      {/* Formular */}
      <div className="flex items-center justify-center bg-slate-100 px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-amber-400">
              <Car size={22} strokeWidth={2.2} />
            </div>
            <p className="text-sm font-semibold text-slate-900">MyLittleCarDealership</p>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">Anmelden</h2>
          <p className="mt-1 text-sm text-slate-500">Mit deinem Konto am Betrieb arbeiten.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
            <Field label="E-Mail" error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="chef@mylittlecardealership.ch"
                {...register("email")}
              />
            </Field>

            <Field label="Passwort" error={errors.password?.message}>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register("password")}
              />
            </Field>

            {error ? <Alert>{error}</Alert> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Anmelden …" : "Anmelden"}
              {isSubmitting ? null : <ArrowRight size={16} />}
            </Button>
          </form>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Demo-Zugang</p>
            <p className="mt-1 text-xs text-slate-600">
              <span className="font-medium text-slate-800">chef@mylittlecardealership.ch</span> ·{" "}
              <span className="font-mono text-slate-800">changeme</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Bitte ändere das Passwort nach dem ersten Login.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}