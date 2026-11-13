# MyLittleCarDealership

Betriebssoftware für freie Occasion-Händler (Schweiz). Dieses Repository enthält
das **Grundgerüst**: Login, Benutzerverwaltung, Betriebs-Stammdaten, Audit-Log und
die komplette Infrastruktur (Docker, nginx, Traefik, Backup). Die Fachmodule
(Fahrzeuge, Kunden, Angebote, Rechnungen …) folgen mit den Spezifikationen.

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
  prisma/          schema.prisma, seed.ts
  src/
    app.ts         Fastify-Setup, CORS, Rate-Limit, Health, Fehlerbehandlung
    env.ts         Env-Validierung (zod)
    plugins/       auth.ts (JWT, Sessions, Rollen)
    modules/       auth.routes.ts, users.routes.ts, settings.routes.ts
    lib/           prisma.ts, audit.ts, mailer.ts
apps/web/          React-Frontend
  src/
    components/    ui.tsx (Buttons, Inputs, Modal …), Layout.tsx
    pages/         Login, Dashboard, Users, Settings, Profile
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

Die Fachmodule kommen mit den Spezifikationen. Aktueller Stand:
[docs/PROJEKT-STATUS.md](docs/PROJEKT-STATUS.md).