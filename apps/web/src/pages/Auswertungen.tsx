import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, PiggyBank, TrendingUp } from "lucide-react";
import { api, apiDownload } from "../lib/api";
import { Card, CardHeader, Spinner } from "../components/ui";
import { chf, formatDate, type ReportSummary } from "../lib/types";

// Auswertungen (Phase E): Umsatz, Bestandswert und Deckungsbeitrag je
// verkauftem Fahrzeug — plus Buchhaltungsexport als CSV (Semikolon,
// Dezimalpunkt, UTF-8-BOM für Excel).

export default function Auswertungen() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading } = useQuery({
    queryKey: ["reports", year],
    queryFn: () => api<ReportSummary>(`/reports?year=${year}`),
  });

  const marginRows = (data?.deckungsbeitrag ?? []).filter((r) => r.margin != null);
  const totalMargin = marginRows.reduce((sum, r) => sum + (r.margin ?? 0), 0);
  const bestMargin = marginRows.reduce((best, r) => ((r.margin ?? 0) > (best.margin ?? -Infinity) ? r : best), marginRows[0]);
  const years = [0, 1, 2].map((offset) => new Date().getFullYear() - offset);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Zahlen</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Auswertungen</h1>
        <p className="mt-1 text-sm text-slate-500">Umsatz, Bestandswert und Deckungsbeitrag — Grundlage für den Buchhaltungsexport.</p>
      </header>

      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jahr</label>
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              y === year ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Umsatz {data.year}</p>
                <TrendingUp size={18} className="text-slate-400" />
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{chf(data.umsatz)}</p>
              <p className="mt-1 text-xs text-slate-500">Verkaufspreise der im Jahr verkauften Fahrzeuge</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bestandswert (investiert)</p>
                <PiggyBank size={18} className="text-slate-400" />
              </div>
              <p className="mt-3 text-3xl font-semibold text-slate-900">{chf(data.bestandswert)}</p>
              <p className="mt-1 text-xs text-slate-500">Ankaufspreise + Ist-Kosten der Fahrzeuge bis Verkaufsphase</p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deckungsbeitrag {data.year}</p>
                <BarChart3 size={18} className="text-slate-400" />
              </div>
              <p className={`mt-3 text-3xl font-semibold ${totalMargin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{chf(totalMargin)}</p>
              <p className="mt-1 text-xs text-slate-500">Verkaufspreis − Ankaufspreis − Ist-Kosten (verkauft)</p>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Deckungsbeitrag je Fahrzeug"
              description="Soll/Ist-Vergleich über die ganze Wertschöpfungskette des Fahrzeugs."
              actions={
                <button
                  type="button"
                  onClick={() => apiDownload("/reports/buchhaltung.csv", `buchhaltung-${new Date().toISOString().slice(0, 10)}.csv`)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400"
                >
                  <Download size={14} /> Buchhaltungsexport (CSV)
                </button>
              }
            />
            {data.deckungsbeitrag.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">Noch keine abgeschlossenen oder verkauften Fahrzeuge in der Datenbank.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-2.5 font-semibold">Fahrzeug</th>
                      <th className="px-3 py-2.5 font-semibold">Verkauft am</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Ankauf</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Aufbereitung (Ist)</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Verkauf</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Deckungsbeitrag</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.deckungsbeitrag.map((row) => (
                      <tr key={row.vehicleId} className="hover:bg-slate-50">
                        <td className="px-5 py-2.5">
                          <Link to={`/fahrzeuge/${row.vehicleId}`} className="font-medium text-slate-800 hover:text-amber-700 hover:underline">
                            {row.vehicleTitle}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{formatDate(row.soldAt)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{chf(row.purchasePrice)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{chf(row.prepCosts)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{chf(row.salePrice)}</td>
                        <td className={`px-5 py-2.5 text-right font-semibold ${(row.margin ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {chf(row.margin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bestMargin ? (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                Bestes Fahrzeug: {bestMargin.vehicleTitle} mit {chf(bestMargin.margin)} Deckungsbeitrag.
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}
