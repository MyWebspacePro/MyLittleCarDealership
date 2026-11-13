import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Car, Handshake, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import { PublicVehicleCard, type PublicVehicle } from "./Board";

export default function Landing() {
  const { data: board } = useQuery({
    queryKey: ["public-board"],
    queryFn: () => api<PublicVehicle[]>("/public/board"),
  });
  const teaser = (board ?? []).slice(0, 3);

  return (
    <div className="space-y-14">
      <section className="rounded-3xl bg-slate-900 px-6 py-14 text-center text-white sm:px-12">
        <h1 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
          Occasionen aus Schaffhausen — geprüft, aufbereitet, fair.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-slate-300">
          Kleiner, persönlicher Occasionshandel: Jedes Fahrzeug wird bei uns geprüft und vor dem Verkauf aufbereitet.
          Und wenn Sie verkaufen möchten, kaufen wir Ihr Auto gerne unverbindlich an.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            to="/boerse"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300"
          >
            Fahrzeuge entdecken <ArrowRight size={16} />
          </Link>
          <Link
            to="/ankauf"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-slate-400"
          >
            Auto verkaufen
          </Link>
        </div>
      </section>

      <section>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { icon: Car, title: "Geprüfter Bestand", text: "MFK, Servicehistorie und Zustand — wir sagen es Ihnen, wie es ist." },
            { icon: Handshake, title: "Ankauf ohne Aufwand", text: "Formular ausfüllen, Fotos hochladen, Angebot erhalten. Eintausch möglich." },
            { icon: ShieldCheck, title: "Persönlich vor Ort", text: "Besichtigung und Probefahrt nach Termin — kein Papierkrieg ohne uns." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-slate-200 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <Icon size={20} />
              </span>
              <h2 className="mt-3 text-base font-semibold text-slate-900">{title}</h2>
              <p className="mt-1.5 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {teaser.length ? (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Aktuell bei uns</h2>
              <p className="text-sm text-slate-500">Eine Auswahl aus der Fahrzeugbörse.</p>
            </div>
            <Link to="/boerse" className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900">
              Alle Fahrzeuge <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {teaser.map((v) => (
              <PublicVehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">Ihr Auto soll weg? Sprechen Sie uns an.</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
          Vom Formular bis zum Eintausch: Wir kaufen Occasionen aller Marken an — auch ohne Neukauf bei uns.
        </p>
        <Link
          to="/ankauf"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Unverbindliche Anfrage starten <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
