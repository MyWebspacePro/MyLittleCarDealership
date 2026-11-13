import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Car, LogIn } from "lucide-react";

// Öffentliches Layout (ohne Login): Kopf mit Navigation zu Börse und
// Ankauffsformular, Impressum/Datenschutz im Fuss.

const nav = [
  { to: "/", label: "Start" },
  { to: "/boerse", label: "Fahrzeugbörse" },
  { to: "/ankauf", label: "Verkaufen Sie uns Ihr Auto" },
  { to: "/impressum", label: "Impressum" },
];

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-slate-950 shadow shadow-amber-400/30">
              <Car size={20} strokeWidth={2.2} />
            </span>
            <span className="text-sm font-semibold text-slate-900">MyLittleCarDealership</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400"
          >
            <LogIn size={14} /> Login
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs ${
                  isActive ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-600"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} MyLittleCarDealership · Occasionshandel</span>
          <span className="flex gap-4">
            <Link to="/impressum" className="hover:text-slate-800">
              Impressum
            </Link>
            <Link to="/datenschutz" className="hover:text-slate-800">
              Datenschutz
            </Link>
            <Link to="/login" className="hover:text-slate-800">
              Interner Bereich
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
