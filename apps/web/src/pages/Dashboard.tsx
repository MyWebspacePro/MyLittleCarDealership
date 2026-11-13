import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, CarFront, Inbox, Settings, ShieldCheck, UserRound, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Card, CardHeader, RoleBadge, Spinner } from "../components/ui";
import {
  ROLES,
  REMINDER_LEVEL_LABELS,
  chf,
  type InvoiceInfo,
  type LeadListItem,
  type Setting,
  type User,
  type VehicleListItem,
} from "../lib/types";

const quickLinks = [
  { to: "/users", label: "Team verwalten", description: "Benutzer, Rollen und Zugänge", icon: Users },
  { to: "/settings", label: "Einstellungen", description: "Firma, MWST und Bankdaten", icon: Settings },
  { to: "/profile", label: "Mein Profil", description: "Passwort und Konto", icon: UserRound },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
  });
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<Setting>("/settings"),
  });
  const { data: leads } = useQuery({
    queryKey: ["leads"],
    queryFn: () => api<LeadListItem[]>("/leads"),
  });
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api<VehicleListItem[]>("/vehicles"),
  });
  // Erinnerungen: offene/überfällige Rechnungen und fällige Mahnfristen.
  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api<InvoiceInfo[]>("/invoices"),
  });
  const openInvoices = (invoices ?? []).filter((i) => !i.isCredit && (i.status === "VERSANDT" || i.status === "TEILZAHLUNG"));
  const overdueInvoices = openInvoices.filter((i) => i.dueAt && new Date(i.dueAt) < new Date());
  const dueReminders = openInvoices.filter((i) => i.reminderDueAt && new Date(i.reminderDueAt) < new Date());

  const loading = usersLoading || settingsLoading;
  const newLeads = (leads ?? []).filter((l) => l.status === "NEU").length;
  const forSale = (vehicles ?? []).filter((v) => v.status === "VERKAUF").length;
  const inPrep = (vehicles ?? []).filter((v) => v.status === "AUFBEREITUNG" || v.status === "GEKAUFT").length;
  // Bewegungsmessung: längste Standtage im aktiven Bestand.
  const slowest = (vehicles ?? [])
    .filter((v) => v.status === "VERKAUF" || v.status === "AUFBEREITUNG")
    .sort((a, b) => b.daysInStatus - a.daysInStatus)[0];
  const active = users?.filter((u) => u.active).length ?? 0;
  const roleCount = (role: string) => users?.filter((u) => u.role === role).length ?? 0;
  const date = new Date().toLocaleDateString("de-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">{date}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Willkommen zurück{user?.name ? `, ${user.name}` : ""}.
        </h1>
        <p className="mt-1 text-sm text-slate-500">Der aktuelle Stand deines Betriebs.</p>
      </header>

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team</p>
              <Users size={18} className="text-slate-400" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{users?.length ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">
              {active} aktiv · {(users?.length ?? 0) - active} inaktiv
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rollen</p>
              <ShieldCheck size={18} className="text-slate-400" />
            </div>
            <ul className="mt-3 space-y-2">
              {ROLES.map((role) => (
                <li key={role} className="flex items-center justify-between">
                  <RoleBadge role={role} />
                  <span className="text-sm font-medium text-slate-700">{roleCount(role)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Betrieb</p>
              <Building2 size={18} className="text-slate-400" />
            </div>
            <p className="mt-3 truncate text-sm font-semibold text-slate-900">
              {settings?.companyName ?? "—"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {[settings?.zip, settings?.city].filter(Boolean).join(" ") || "Adresse noch offen"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              MWST {settings?.vatRateStandard ?? "—"} % · Zahlungsziel{" "}
              {settings?.paymentDays ?? "—"} Tage
            </p>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/posteingang" className="group">
          <Card className="h-full p-5 transition-colors group-hover:border-amber-300">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Posteingang Ankauf</p>
              <Inbox size={18} className="text-slate-400" />
            </div>
            <p className={`mt-3 text-3xl font-semibold ${newLeads > 0 ? "text-amber-600" : "text-slate-900"}`}>{newLeads}</p>
            <p className="mt-1 text-xs text-slate-500">
              neue Ankaufsanfragen — Web-Formular, WhatsApp und E-Mail {newLeads > 0 ? "· prüfen!" : ""}
            </p>
          </Card>
        </Link>

        <Link to="/fahrzeuge" className="group">
          <Card className="h-full p-5 transition-colors group-hover:border-amber-300">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fahrzeugbestand</p>
              <CarFront size={18} className="text-slate-400" />
            </div>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{vehicles?.length ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">
              {forSale} im Verkauf · {inPrep} in Aufbereitung
            </p>
            {slowest ? (
              <p className={`mt-2 text-xs font-medium ${slowest.daysInStatus > 60 ? "text-rose-600" : slowest.daysInStatus > 30 ? "text-amber-600" : "text-slate-500"}`}>
                Längster im Bestand: {slowest.daysInStatus} Tage ({slowest.make} {slowest.model})
              </p>
            ) : null}
          </Card>
        </Link>
      </div>

      {overdueInvoices.length || dueReminders.length ? (
        <Card>
          <CardHeader
            title="Erinnerungen"
            description="Überfällige Rechnungen und fällige Mahnfristen — besser heute als morgen."
          />
          <div className="divide-y divide-slate-100">
            {overdueInvoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Überfällig</span>
                <span className="font-medium text-slate-800">
                  {inv.isCredit ? "Gutschrift" : "Rechnung"} {inv.number}
                </span>
                <span className="text-slate-600">{inv.vehicleTitle}</span>
                <span className="text-slate-500">Fällig am {new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(inv.dueAt!))}</span>
                <span className="ml-auto font-semibold text-slate-800">{chf(inv.totalAmount)}</span>
              </div>
            ))}
            {dueReminders.map((inv) => (
              <div key={`r-${inv.id}`} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Mahnfrist abgelaufen</span>
                <span className="font-medium text-slate-800">
                  Rechnung {inv.number} ({REMINDER_LEVEL_LABELS[inv.reminderLevel]})
                </span>
                <span className="text-slate-600">{inv.vehicleTitle}</span>
                <span className="ml-auto font-semibold text-slate-800">{chf(inv.totalAmount)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Schnellzugriff" description="Die wichtigsten Bereiche auf einen Blick." />
        <div className="grid gap-px overflow-hidden rounded-b-2xl bg-slate-100 sm:grid-cols-3">
          {quickLinks.map(({ to, label, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-start gap-3 bg-white px-5 py-4 transition-colors hover:bg-slate-50"
            >
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-amber-100 group-hover:text-amber-700">
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
              <ArrowUpRight
                size={16}
                className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500"
              />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}