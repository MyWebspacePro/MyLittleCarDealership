# Projekt-Status

Stand: 13.11.2026 (Phase C der Schaltzentrale)

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

## Offen / als Nächstes (Phasen D–G)

- **B Ankauf** ✓ (13.11.2026): Leads, Übernehmen, Angebots-/Ankaufsvertrag-PDF, Eintausch
- **C Aufbereitung** ✓ (13.11.2026): Aufträge mit Anbieter-Typen, Soll/Ist-Rückfluss, Automatik
- **D Verkauf-Frontend**: Exposé + AS24-Vorbereitung (kopierfertig), A3-Tafel-PDF mit QR,
  Anfragen-Protokoll mit Klick-Links, Termine/Kalender, Standtage im Dashboard
- **E Abschluss**: Kaufvertrag-PDF (OR-Klauseln), Schweizer QR-Rechnung (`swissqrbill`,
  QR-IBAN + 27-stellige QRR), Leasing-Variante, Zusatzleistungen, Zahlungen, GwG-Check
  bei Bar ≥ 100'000, Gutschrift, Mahnwesen mit Mahn-PDFs, E-Mail-Versand,
  Zusammenfassungs-PDF (Archiv 10 J.), Auswertungen, Buchhaltungsexport CSV
- **F Öffentliche Seite**: Landing + Ankaufsformular (Uploads, nDSG-Einwilligung,
  Rate-Limit/Honeypot) + Fahrzeugbörse + Impressum/Datenschutz
- **G**: Demo-Seed 1:1 VPS, Doku-Finalisierung

## Verifiziert (Phase A)

- API-Smoke: Health/Login/CRUD mit Token, geschützte Routen 401 ohne; Kalkulation
  14'900 − 300 − 1'800 = 12'800 korrekt; Statuswechsel setzt Standtage zurück
- Upload-Runde im Docker-Vollstack (nginx → API): Foto-Upload 201, öffentliche
  Auslieferung 200, Pfad-Traversal verweigert (400) bzw. von nginx normalisiert
- UI (Playwright, 9/9): Login → Fahrzeuge → Detail (Foto-Upload, Ankauf-Kalkulation,
  Statuswechsel) → Kunden; mobil ohne horizontalen Überlauf
- `npm run build` (tsc beider Apps + Vite) fehlerfrei
- Docker-Vollstack: db push + seed + seed-demo im neuen Image, Port 8080

## Bekannte Hinweise

- `npm audit` meldet Advisories für `zod` (<4.6.6), `react-router` (6.x), `nodemailer`
  (6.x) und die transitive `deepmerge-ts` (über Prisma). Die Korrekturen sind Breaking
  Changes (zod 4, react-router 7, nodemailer 10) und werden mit den Fach-Phasen
  eingehend geprüft. Die betroffenen Patterns werden im aktuellen Stand nicht verwendet.
- `nodemailer` ist nur Stub (`lib/mailer.ts`) — aktiv ab Phase E (Dokumentenversand,
  Lead-Benachrichtigung).
- HEIC-Fotos (iPhone) werden akzeptiert und gespeichert, zeigen aber nicht in jedem
  Browser. Chrome-Anwender laden ggf. JPG konvertierte Fotos hoch.
