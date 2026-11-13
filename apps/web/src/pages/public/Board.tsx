import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Fuel, Gauge, Settings2 } from "lucide-react";
import { api } from "../../lib/api";
import { chf, formatDate } from "../../lib/types";

// Öffentliche Fahrzeugbörse (Phase F): Fahrzeuge in Verkauf/Aufbereitung,
// nur Inseratsdaten — keine Business-Zahlen.

export interface PublicVehicle {
  id: string;
  title: string;
  firstRegistration: string | null;
  mileageKm: number | null;
  fuel: string | null;
  transmission: string | null;
  color: string | null;
  price: number | null;
  description: string | null;
  equipment: string[];
  coverPhoto: string | null;
  status: "VERKAUF" | "AUFBEREITUNG";
}

export function PublicVehicleCard({ vehicle }: { vehicle: PublicVehicle }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {vehicle.coverPhoto ? (
        <img
          src={`/uploads/photos/${vehicle.coverPhoto}`}
          alt={vehicle.title}
          className="h-48 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid h-48 w-full place-items-center bg-slate-100 text-slate-400">
          <span className="text-sm">Foto folgt</span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{vehicle.title}</h3>
          {vehicle.status === "AUFBEREITUNG" ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">in Aufbereitung</span>
          ) : null}
        </div>
        <p className="text-xl font-semibold text-slate-900">{vehicle.price != null ? chf(vehicle.price) : "Preis auf Anfrage"}</p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} /> {vehicle.firstRegistration ? formatDate(vehicle.firstRegistration) : "–"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge size={12} /> {vehicle.mileageKm != null ? `${vehicle.mileageKm.toLocaleString("de-CH")} km` : "–"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Fuel size={12} /> {[vehicle.fuel, vehicle.transmission].filter(Boolean).join(" / ") || "–"}
          </span>
        </dl>
        {vehicle.description ? (
          <p className="line-clamp-3 text-sm text-slate-600">{vehicle.description}</p>
        ) : null}
        {vehicle.equipment.length ? (
          <p className="inline-flex items-start gap-1 text-xs text-slate-500">
            <Settings2 size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{vehicle.equipment.slice(0, 6).join(" · ")}</span>
          </p>
        ) : null}
        <Link
          to={`/ankauf?interesse=${encodeURIComponent(vehicle.title)}`}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Interesse melden <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}

export default function Boerse() {
  const { data, isLoading } = useQuery({
    queryKey: ["public-board"],
    queryFn: () => api<PublicVehicle[]>("/public/board"),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Fahrzeugbörse</h1>
        <p className="mt-1 text-sm text-slate-500">
          Unser aktueller Bestand — Occasionen, geprüft und aufbereitet. Fahrzeug gefallen? Melden Sie sich, probefahren lohnt sich.
        </p>
      </header>
      {isLoading ? (
        <p className="py-12 text-center text-sm text-slate-500">Fahrzeuge werden geladen …</p>
      ) : !data?.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-sm text-slate-500">Aktuell stehen keine Fahrzeuge im Bestand — schauen Sie bald wieder vorbei.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((v) => (
            <PublicVehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      )}
    </div>
  );
}
