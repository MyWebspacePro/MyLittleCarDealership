# Projekt-Status

Stand: 13.11.2026 (Phase G — Schaltzentrale vollständig umgesetzt)

## Live

- https://mylittlecardealership.aiconso.eu (VPS, Traefik/TLS, Docker Compose)

## Enthalten (Grundgerüst, Phase 0)

- Login mit Zwei-Token-Auth (Access-JWT 15 min, Refresh-JWT 30 Tage als httpOnly-Cookie,
  Session-Tabelle mit Rotation und Diebstahl-Erkennung)
- Benutzerverwaltung: anlegen, bearbeiten, deaktivieren; Rollen ADMIN / SALES / FINANCE;
  Schutz des letzten aktiven Administrators und des eigenen Kontos
- Betriebs-Stammdaten (Firma, Adresse, MWST, Bank, Zahlungsziel) — ADMIN-schreibgeschützt
- Audit-Log, Profilseite mit Passwortwechsel, Dashboard
- Docker: Entwicklung (DB + Mailhog), VPS (Traefik), lokaler Vollständiger Test (Port 8080)
- Tägliches Backup (pg_dump, 30 Tage)

## Phase A — Fundament der Schaltzentrale (13.11.2026)

- Datenmodell: Kunden (Privat/Firma), Fahrzeuge mit Status-Pipeline
  (Angefragt → Kalkulation → Angebot → Gekauft → Aufbereitung → Verkauf → Verkauft →
  Abgeschlossen, + Abgelehnt), Ankaufsvorgänge mit Kalkulationspositionen, Verkaufsvorgänge,
  Aufträge, Anbieter, Anfragen, Termine, Zahlungen, Rechnungen, generierte Dokumente
  (Rechnung/Leasing/Mahnwesen/Zusatzleistungen erst ab Phase E befüllt)
- Foto-Uploads (öffentlich unter /uploads/photos) und Verwaltungs-Dokumente
  (Fahrzeugausweis etc., nur authentifiziert), je 8 MB, MIME-Whitelist, Docker-Volume
- Kalkulationslogik: Ankaufs-Empfehlung = Zielverkaufspreis (AS24-Vergleich) −
  erwartete Kosten − Zielgewinn; Projektion des Gewinns inkl. Ist-Ankaufspreis
- Pipeline-Automatik: Ankaufsvorgang abschließen/ablehnen schiebt den Fahrzeug-Status
  passend weiter (nie rückwärts)
- UI: Fahrzeuge (Pipeline-Chips, Suche, Anlegen), Fahrzeug-Detail (Tabs Übersicht/
  Ankauf/Aufträge/Verkauf/Anfragen/Termine — letztere Platzhalter), Kunden (CRUD,
  Typ-Filter), Navigation erweitert
- Demo-Seed `prisma/seed-demo.ts` (4 Fahrzeuge in verschiedenen Stadien,
  3 Kontakte) — lokal wie VPS identisch (`npm run db:seed-demo` im API-Workspace)

## Phase B — Ankauf (13.11.2026)

- **Posteingang**: Ankaufsanfragen aus Web-Formular/WhatsApp/E-Mail als Leads —
  Kontaktdaten, Fahrzeugangaben, Preisvorstellung, Erstkontakt-Notiz; Foto-Uploads
  (öffentlich ausgeliefert) und Fahrzeugausweis/Belege (nur authentifiziert)
- **Übernehmen**: Lead wird zu Kontakt (neu oder bestehend) + Fahrzeug + Ankaufsvorgang;
  Fotos wandern in die Fahrzeugfotos, Fahrzeugausweis in die Verwaltungs-Dokumente
- **Angebots-PDF**: nur der Ankaufspreis sichtbar (keine Kosten, kein Gewinn), Gültigkeit
  14 Tage; bei Eintausch bewusst nicht verfügbar (Verrechnung im Verkauf)
- **Ankaufsvertrag-PDF**: Parteien, § 1 Vertragsgegenstand, § 2 Kaufpreis/Zahlung,
  § 3 Übergabe (Fahrzeugausweis/Serviceheft/Schlüssel/Kontrollscheibe, Abmeldung),
  § 4 Zustand & Gewährleistung (Standardtext «wie besichtigt», überschreibbar über
  Einstellungen), § 5 Schlusserklärung — erfüllt die MWST-Belegpflichten nach
  Art. 38 MWSTG (Typ, Stammnummer, Datum, Name/Adresse des Verkäufers); bei
  Eintausch als Übernahmebestätigung mit Abzugsposten-Hinweis
- Dokumente werden archiviert (GeneratedDocument) und sind aus dem Ankauf-Tab
  herunterladbar; Dashboard mit Posteingang- und Bestand-Karte
- **Fix**: Single-Flight-Refresh im API-Client — parallele 401-Retries (React
  StrictMode) teilen sich einen /auth/refresh; davor konnte die Doppel-Refresh-Race
  die Session-Rotation als Diebstahl werten und alle Sessions sperren

## Phase C — Aufbereitung (13.11.2026)

- Aufträge (WorkOrders) je Fahrzeug: intern / Markenwerkstatt / Partnerwerkstatt /
  extern / Aufbereiter — Typ, Anbieter (Stammdaten /providers), Soll-Kosten,
  Ist-Kosten, geplant/completedAt, Notizen
- Automatik: Beim Abschluss eines Ankaufsvorgangs werden die Kalkulationspositionen
  automatisch als Aufträge angelegt (AUFBEREITUNG→Aufbereiter, REPARATUR→Partnerwerkstatt,
  SERVICE→Markenwerkstatt, SONSTIGES→extern, Soll-Kosten = Betrag); der erste
  Auftrag startet die Pipeline GEKAUFT → AUFBEREITUNG
- Soll/Ist-Deckungsbeitrag: die Ist-Kosten der Aufträge fliessen live in die
  Gewinnprognose im Ankauf-Tab zurück; Ankaufs-Tab zeigt beide Summen
- Anbieter-Verwaltung (4 Typen, Demo: Vertretung, Partner-Werkstatt, Dellen-Doktor,
  CarPolish); Detail-Tab «Aufträge» mit Inline-Statuswechsel und Modal

## Phase D — Verkauf-Frontend (13.11.2026)

- **AS24-Vorbereitung** im Verkauf-Tab: kopierfertige Datenliste (Marke/Modell, EZ,
  km, Treibstoff, Getriebe, Farbe) + Inserat-Text aus Fahrzeugdaten/Beschreibung —
  der Händler stellt manuell auf AutoScout24 ein (System bewusst ohne Portal-API)
- **Sonderausstattungs-Maske**: Katalog mit ~30 üblichen Ausstattungsmerkmalen
  (Matrix-LED, ACC, Rückfahrkamera, Isofix, AHK …), Auswahl wird am Fahrzeug
  gespeichert und fliest in Inserat-Text und Tafel-PDF ein; AS24-Inserat-Link wird
  am Fahrzeug verwaltet (Basis für QR-Code auf der Tafel)
- **A3-Tafel-PDF** (quer): Preisbox oben rechts (optionaler Tafel-Preis abweichend
  vom Zielpreis), Fahrzeug-Titel, Faktenzeile, Beschreibung, Ausstattung in zwei
  Spalten, **QR-Code → AS24-Inserat** mit Beschriftung; passt garantiert auf eine
  A3-Seite
- **Anfragen-Protokoll** je Fahrzeug: Kanal (Telefon/WhatsApp/E-Mail/AS24/Besuch),
  verknüpfter Kontakt oder Freitextname, Betreff, Verlauf, Wiedervorlage (überfällig
  rot), erledigt; **Klick-Links** WhatsApp (wa.me mit CH-Rufnummern-Normalisierung),
  Telefon (tel:), E-Mail (mailto:) — der Nutzer telefoniert/whatsappt selbst,
  das System protokolliert
- **Termine**: Besichtigungen/Probefahrten/Rückrufe je Fahrzeug (datetime, Status
  geplant/fertig/abgesagt, Notizen) mit Aktions-Buttons; **Kalender-Seite** gruppiert
  alle Termine ab heute nach Tagen (Heute/Morgen/Wochentag)
- **Standtage**: statusChangedAt je Fahrzeug; Dashboard-Bestand-Karte zeigt den
  längsten Bestandsalten mit Ampel (>30 Tage amber, >60 rot)
- Demo-Seed erweitert: Golf mit 8 Ausstattungsmerkmalen + AS24-Link, 2 Anfragen,
  Probefahrt/Besichtigung mit kalenderstabilen Terminen (morgen 14:00 / übermorgen 10:00)

## Phase F — Öffentliche Seite (13.11.2026)

- **Fahrzeugbörse** (`/boerse`, ohne Login): Fahrzeuge in Verkauf/Aufbereitung —
  nur Inseratsdaten (Titel, Preis, EZ, km, Treibstoff/Getriebe, Beschreibung,
  Ausstattung, Titelbild); **keine** Gewinn-/Ankaufsdaten; Aufbereitungsfahrzeuge
  mit «in Aufbereitung»-Badge; öffentliche API `GET /api/public/board`
- **Ankauffsformular** (`/ankauf`, ohne Login): Kontaktdaten, Fahrzeugangaben,
  Preisvorstellung, Nachricht, **bis zu 8 Fotos + Fahrzeugausweis** (Upload,
  8 MB je Datei) — landet als Lead im internen Posteingang (Status NEU,
  Kanal WEBFORM) und löst eine **E-Mail-Benachrichtigung** an den Betrieb aus
  (SMTP; ohne SMTP-Konfiguration bleibt die Anfrage trotzdem sicher im System).
  Missbrauchsschutz: **Honeypot-Feld** (gefüllt → 400) und **IP-Rate-Limit**
  (5 Anfragen/Stunde), **nDSG-Einwilligung zwingend** (Checkbox → Datenschutzerklärung)
- **Landing** (`/`): eingeloggt → interne Schaltzentrale, ausgeloggt → öffentliche
  Landingpage mit Hero, Börse-Teaser und Ankauf-CTA; öffentliches Layout mit
  Navigation und Fusszeile (Impressum/Datenschutz/Login)
- **Impressum & Datenschutzerklärung** (`/impressum`, `/datenschutz`): Platzhalter-
  Texte gemäss Schweizer Praxis (nDSG, Aufbewahrung 10 Jahre, GwG-Hinweis bei
  Barzahlung ≥ 100'000) — der Händler ersetzt Name/Adresse/UID durch seine Daten
- Multipart-Limit auf 9 Dateien erhöht (Ankauffsformular: Fotos + Ausweis);
  401-Redirect des API-Clients nimmt öffentliche Pfade aus — Gäste werden nicht
  mehr zum Login geschossen

## Offen / als Nächstes

- **A Fundament** ✓ · **B Ankauf** ✓ · **C Aufbereitung** ✓ · **D Verkauf-Frontend** ✓ ·
  **E Abschluss** ✓ · **F Öffentliche Seite** ✓ · **G Doku & Live-Verifikation** ✓
  (je 13.11.2026, Details oben)
- **Betreiber-Aufgaben** (siehe README/VPS-ÜBERGABE): eigener QR-IBAN der Bank,
  Impressum mit echten Angaben, SMTP für den PDF-E-Mail-Versand, AS24-Portal-Link,
  Partner-Namen (Werkstatt/Leasing/Garantie) als Stammdaten
- **Ausbaustufen** (bewusst zurückgestellt): WhatsApp Cloud API / IMAP-Eingang
  (Kommunikation bleibt manuell protokolliert mit Klick-Links), AutoScout24 Listing
  Creation API (braucht Händler-Account-Freischaltung), npm-audit-Advisories
  (zod 4 / react-router 7 / nodemailer 10 — Breaking Changes, geprüft einbauen)

## Verifiziert

**Phase A**
- API-Smoke: Health/Login/CRUD mit Token, geschützte Routen 401 ohne; Kalkulation
  14'900 − 300 − 1'800 = 12'800 korrekt; Statuswechsel setzt Standtage zurück
- Upload-Runde im Docker-Vollstack (nginx → API): Foto-Upload 201, öffentliche
  Auslieferung 200, Pfad-Traversal verweigert (400) bzw. von nginx normalisiert
- UI (Playwright, 9/9): Login → Fahrzeuge → Detail (Foto-Upload, Ankauf-Kalkulation,
  Statuswechsel) → Kunden; mobil ohne horizontalen Überlauf

**Phase D**
- Docker-Vollstack (Port 8080): db push + seed + seed-demo im neuen Image;
  Anfragen anlegen/erledigen/löschen, Termine anlegen/Kalender-Listing/löschen,
  Tafel-PDF (1 A3-Seite, 14.5 KB), alle über nginx — 401 ohne Token
- UI (Playwright, 12/12): AS24-Vorbereitung, Ausstattungs-Maske + Speichern,
  Tafel-Karte, Anfragen mit WhatsApp-Klick-Link, Termine, Kalender-Gruppierung,
  Standtage im Dashboard

**Phase E**
- API-Durchlauf (dev + Docker-Vollstack): Kaufvertrag-PDF, Rechnung 2026-001 mit
  korrekten Beträgen (Netto 21'359.85, MWST 1'730.15, Abgaben 50, Total 23'140),
  gültiger QRR (30031…018), Rechnungs-PDF-Download, Mahnstufe 1, Zahlung mit
  Auto-Status, GwG-Block bei Bar 120'000 ohne Identitätsfelder (400), Gutschrift
  mit negativem Total und Verknüpfung, Zusammenfassungs-PDF, Reports (Bestandswert
  40'145), CSV-Export, PDF-E-Mail (Mailhog) — 401 ohne Token
- QR-Rechnung visuell geprüft: Zahlteil (Empfangsschein + QR-Code + Zahlbar durch)
  korrekt auf der A4-Seite, Mahnungs-PDF mit reduziertem Betrag (18'140.00) und
  QR-Teil auf eigener Seite; Kaufvertrag 2 Seiten mit § 1–5 und Checkliste
- UI (Playwright, 16/16): Abschluss-Karte, Zusatzleistung, Kaufvertrag-PDF,
  QR-Rechnung erstellen, Mahn-Stufe 1, GwG-Box im Zahlungs-Modal + Speichern mit
  Badge, Rechnung automatisch «Bezahlt», Auswertungs-KPIs, CSV-Button,
  Settings mit QR-IBAN-Feld, Navigation Auswertungen

**Phase F**
- API (dev + Docker-Vollstack über nginx): `/api/public/board` ohne Login (2
  Fahrzeuge), Lead-Submit mit Foto + Fahrzeugausweis → Posteingang NEU,
  Honeypot gefüllt → 400, fehlende Einwilligung → 400, Lead-Benachrichtigung
  in Mailhog, Test-Lead wieder entfernt — 401 auf internen Routen bleibt
- UI (Playwright, 11/11): Landing für Gäste (kein internes «Willkommen zurück»),
  Börse mit Preisen und Aufbereitung-Badge ohne Gewinndaten, Ankauffsformular
  mit Upload + Erfolgsseite, Lead im internen Posteingang, Login → Dashboard,
  Impressum/Datenschutz mit GwG-Hinweis
- Lokal = VPS: Datenstand per state-check verglichen (Leads, Fahrzeuge,
  Dokumente, Rechnungen identisch)

Jede Phase: `npm run build` (tsc beider Apps + Vite) fehlerfrei; UI-Tests mobil und
Desktop; Docker-Vollstack danach `down -v`.

## Bekannte Hinweise

- `npm audit` meldet Advisories für `zod` (<4.6.6), `react-router` (6.x), `nodemailer`
  (6.x) und die transitive `deepmerge-ts` (über Prisma). Die Korrekturen sind Breaking
  Changes (zod 4, react-router 7, nodemailer 10) und werden mit den Fach-Phasen
  eingehend geprüft. Die betroffenen Patterns werden im aktuellen Stand nicht verwendet.
- `nodemailer` ist nur Stub (`lib/mailer.ts`) — aktiv ab Phase E (Dokumentenversand,
  Lead-Benachrichtigung).
- HEIC-Fotos (iPhone) werden akzeptiert und gespeichert, zeigen aber nicht in jedem
  Browser. Chrome-Anwender laden ggf. JPG konvertierte Fotos hoch.
