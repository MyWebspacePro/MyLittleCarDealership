import { NavLink, Outlet } from "react-router-dom";
import { Car, LayoutDashboard, LogOut, Settings, UserRound, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ROLE_LABELS } from "../lib/types";

const navigation = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard, end: true },
  { to: "/users", label: "Team", icon: Users, end: false },
  { to: "/settings", label: "Einstellungen", icon: Settings, end: false },
  { to: "/profile", label: "Mein Profil", icon: UserRound, end: false },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20">
        <Car size={22} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-white">MyLittleCarDealership</p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Occasionshandel</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const initials = user?.name
    ?.split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen lg:flex">
      {/* Seitenleiste (Desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-950 lg:flex">
        <div className="px-5 py-6">
          <Brand />
        </div>

        <nav className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-slate-200">
              {initials || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-500">{user ? ROLE_LABELS[user.role] : ""}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Abmelden"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kopfzeile (mobil) */}
        <header className="bg-slate-950 px-4 pb-3 pt-4 lg:hidden">
          <div className="flex items-center justify-between">
            <Brand />
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Abmelden"
            >
              <LogOut size={18} />
            </button>
          </div>
          <nav className="mt-4 flex gap-1 overflow-x-auto">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    isActive ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}