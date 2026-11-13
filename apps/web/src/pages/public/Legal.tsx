// Impressum & Datenschutzerklärung (Phase F). Platzhalter für die
// Stammdaten — der Händler ergänzt Name/Adresse/UID in den Einstellungen
// bzw. lässt den Text durch seine eigene Fassung ersetzen.

export function Impressum() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Impressum</h1>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">
        <div>
          <h2 className="font-semibold text-slate-900">Verantwortlich</h2>
          <p>
            MyLittleCarDealership (Betriebsname)<br />
            Musterstrasse 1<br />
            8200 Schaffhausen<br />
            Schweiz
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Kontakt</h2>
          <p>
            Telefon: +41 52 000 00 00<br />
            E-Mail: info@mylittlecardealership.ch
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Kennzeichnung</h2>
          <p>
            UID/MWST-Nummer: CHE-123.456.789 MWST (Platzhalter — bitte durch die tatsächlichen Angaben ersetzen).
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Haftungshinweis</h2>
          <p>
            Alle Angaben auf dieser Website ohne Gewähr; Irrtümer und Zwischenverkauf vorbehalten.
            Massgeblich sind ausschliesslich die Vertragsunterlagen.
          </p>
        </div>
      </div>
    </div>
  );
}

export function Datenschutz() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Datenschutzerklärung</h1>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">
        <div>
          <h2 className="font-semibold text-slate-900">1. Verantwortliche Stelle</h2>
          <p>
            MyLittleCarDealership, Musterstrasse 1, 8200 Schaffhausen (Platzhalter — bitte durch die
            tatsächlichen Angaben ersetzen). Bei Fragen zum Datenschutz: info@mylittlecardealership.ch.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">2. Welche Daten wir bearbeiten</h2>
          <p>
            Beim Ausfüllen des Ankauffsformulars bearbeiten wir die von Ihnen angegebenen Kontaktdaten,
            Fahrzeugangaben sowie die hochgeladenen Fotos und Dokumente (z. B. Fahrzeugausweis). Diese Daten
            verwenden wir ausschliesslich zur Bearbeitung Ihrer Anfrage und zur Vorbereitung eines allfälligen
            Ankaufs (Art. 6 Abs. 1 lit. b/f DSGVO bzw. Art. 6 Abs. 1 lit. a, Art. 30 f. nDSG für den
            Verwendungszweck der Einwilligung).
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">3. Speicherdauer</h2>
          <p>
            Anfragen, die nicht zu einem Ankauf führen, löschen wir nach angemessener Frist. Bei einem
            Ankauf bewahren wir die Vertrags- und Belegunterlagen gemäss gesetzlichen Aufbewahrungspflichten
            (10 Jahre) auf.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">4. Ihre Rechte</h2>
          <p>
            Sie haben Anspruch auf Auskunft, Berichtigung, Löschung und Datenhergabe (Datenportabilität).
            Die Einwilligung im Formular können Sie jederzeit widerrufen; bereits verarbeitete Daten bleiben
            davon unberührt, soweit eine gesetzliche Grundlage besteht.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">5. Hosting & Cookies</h2>
          <p>
            Die Website läuft auf einem Server in der EU. Wir setzen nur technisch notwendige Cookies
            (Sitzungsverwaltung für den internen Bereich) und keine Tracking-Cookies.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">6. GwG-Hinweis</h2>
          <p>
            Bei Barzahlungen ab CHF 100'000 sind wir nach dem Geldwäschereigesetz verpflichtet, die
            Identität der Vertragspartei festzustellen und zu dokumentieren.
          </p>
        </div>
      </div>
    </div>
  );
}
