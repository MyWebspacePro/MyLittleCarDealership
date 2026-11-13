# MyLittleCarDealership

Betriebssoftware für freie Occasion-Händler (Schweiz) — die komplette
Schaltzentrale vom Erstkontakt bis zum Archiv:

- **Öffentliche Seite**: Landing, Fahrzeugbörse (Bestand öffentlich), Ankauffsformular
  mit Foto-/Fahrzeugausweis-Upload, nDSG-Einwilligung, Honeypot und Rate-Limit,
  Impressum/Datenschutz
- **Ankauf**: Posteingang (Web/WhatsApp/E-Mail), Übernehmen mit Kontakt-/Fahrzeug-Anlage,
  Kalkulation mit Ankaufspreis-Empfehlung (Zielverkaufspreis − Kosten − Zielgewinn),
  Angebots-/Ankaufsvertrag-PDF, Eintausch-Verrechnung
- **Aufbereitung**: Aufträge intern / Markenwerkstatt / Partnerwerkstatt / extern /
  Aufbereiter, Soll/Ist-Rückfluss in die Gewinnprognose, Pipeline-Automatik
- **Verkauf**: AS24-Vorbereitung (kopierfertig) + Inserat-Link, A3-Tafel mit QR-Code,
  Anfragen-Protokoll mit WhatsApp/Telefon/E-Mail-Klick-Links, Termine/Kalender,
  Standtage im Dashboard
- **Abschluss**: Kaufvertrag-PDF (OR 197/210), Schweizer **QR-Rechnung** (SIX IG 2.3,
  QR-IBAN + 27-stellige QRR, MWST im Bruttopreis, Abgaben separat), Leasing-Dossier,
  Zusatzleistungen (Occasionsgarantie …), Zahlungen mit **GwG-Check** (Bar ≥ 100'000),
  Mahnwesen (Erinnerung + 2 Mahnungen als PDF mit QR-Teil), Gutschrift/Storno,
  PDF-E-Mail-Versand, Zusammenfassungs-PDF (Archiv 10 Jahre)
- **Auswertungen**: Umsatz, Bestandswert, Deckungsbeitrag je Fahrzeug,
  Buchhaltungsexport CSV

Live: **https://mylittlecardealership.aiconso.eu**

## Technik

| Bereich | Stack |
|---|---|
| Backend | Fastify 5, TypeScript (ESM), Prisma 6, PostgreSQL 16 |
| Frontend | React 18, Vite 6, Tailwind CSS 4, React Router, TanStack Query |
| Auth | Access-JWT (15 min, nur im Speicher) + Refresh-JWT (30 Tage, httpOnly-Cookie, Rotation, Session-Tabelle) |
| Infrastruktur | Docker Compose, nginx, Traefik/Coolify mit Let's Encrypt |

## Lokal starten

Voraussetzungen: Node.js ≥ 22 und Docker.

```bash
cp .env.example .env       # nur beim ersten Mal
npm install
docker compose up -d       # PostgreSQL 16 + Mailhog
npm run db:push            # Schema in die Datenbank
npm run db:seed            # Musterhändler + Demo-Logins
npm run dev                # API :3001, Web :5173
```

- Web: http://localhost:5173
- API: http://localhost:3001/api/health
- Mailhog (Mails abfangen): http://localhost:8025

Login: `chef@mylittlecardealership.ch` / `changeme`

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | API und Web im Watch-Modus |
| `npm run build` | Typecheck + Produktionsbuild beider Apps |
| `npm run db:push` | Prisma-Schema anwenden (`prisma db push`) |
| `npm run db:seed` | Basis-Seed (idempotent, überschreibt keine Passwörter) |
| `npm run db:studio` | Prisma Studio |
| `npx tsx prisma/seed-demo.ts` (in `apps/api`) | Demo-Daten (Lokal=VPS identisch) |
| `npx tsx prisma/clean-demo.ts` (in `apps/api`) | Demo-Artefakte (PDFs/Rechnungen/Zahlungen) zurücksetzen |

## Demo-Zugänge

| E-Mail | Rolle | Zweck |
|---|---|---|
| `chef@mylittlecardealership.ch` | ADMIN | Voller Zugriff, Benutzerverwaltung |
| `verkauf@mylittlecardealership.ch` | SALES | Verkauf |
| `buchhaltung@mylittlecardealership.ch` | FINANCE | Buchhaltung |

Passwort: `changeme` — **nach dem ersten Login ändern** (Profil → Passwort ändern).

## Rollen

- **ADMIN** — alles, inkl. Benutzer anlegen/bearbeiten/deaktivieren und Einstellungen.
- **SALES** — Team einsehen, Stammdaten lesen; keine Schreibzugriffe auf Einstellungen.
- **FINANCE** — Team einsehen, Stammdaten lesen; keine Schreibzugriffe auf Einstellungen.

Nicht erlaubt (serverseitig erzwungen): letzter aktiver Administrator kann nicht
deaktiviert oder herabgestuft werden; niemand kann das eigene Konto deaktivieren.

## Projektstruktur

```
apps/api/          Fastify-Backend
  prisma/          schema.prisma, seed.ts, seed-demo.ts, clean-demo.ts
  src/
    app.ts         Fastify-Setup, CORS, Rate-Limit, Health, Fehlerbehandlung
    env.ts         Env-Validierung (zod)
    plugins/       auth.ts (JWT, Sessions, Rollen)
    modules/       Fahrzeuge, Ankauf, Aufbereitung, Verkauf, Rechnungen,
                   Mahnwesen, Leads, Anfragen, Termine, Öffentliche Seite …
    lib/           prisma.ts, audit.ts, mailer.ts, pdf.ts, invoicePdf.ts,
                   qrr.ts, uploads.ts
apps/web/          React-Frontend
  src/
    components/    ui.tsx (Buttons, Inputs, Modal …), Layout.tsx
    pages/         FahrzeugDetail (Tabs Ankauf/Aufträge/Verkauf/Anfragen/
                   Termine), Kalender, Posteingang, Auswertungen,
                   public/ (Landing, Börse, Ankauffsformular, Impressum)
    lib/           api.ts, auth.tsx, types.ts
docker-compose*.yml
deploy.sh
```

## Sicherheit

- Refresh-Token als `httpOnly`-Cookie (`Path=/api/auth`, `SameSite=Strict`), Access-Token nur im JS-Speicher.
- Session-Tabelle speichert nur den SHA-256-Hash des Refresh-Tokens; Rotation mit Diebstahl-Erkennung.
- Login: 5 Fehlversuche pro Minute und E-Mail, User-Enumeration-Schutz über Dummy-Hash.
- CORS nur für konfigurierte Origins, keine Wildcards.
- `.env` ist nie im Repository; auf dem Server wird sie beim Deploy erzeugt.

## Deploy

Siehe [DEPLOY.md](DEPLOY.md). Für den Serverbetrieb: `VPS-UEBERGABE.md`.

## Noch offen

Betreiber-Aufgaben (nicht Code): eigener **QR-IBAN** von der Bank (Einstellungen →
Bank & QR-Rechnung), AS24-Händlerportal-Link und Impressums-Angaben (Name/UID)
pflegen, SMTP-Zugang für den PDF-E-Mail-Versand hinterlegen. Aktueller Stand:
[docs/PROJEKT-STATUS.md](docs/PROJEKT-STATUS.md).