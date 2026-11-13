import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, Settings, ShieldCheck, UserRound, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Card, CardHeader, RoleBadge, Spinner } from "../components/ui";
import { ROLES, type Setting, type User } from "../lib/types";

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

  const loading = usersLoading || settingsLoading;
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