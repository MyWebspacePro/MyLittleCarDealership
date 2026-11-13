# VPS-Übergabe: MyLittleCarDealership

Stand: 13.11.2026 (Phase G · Schaltzentrale komplett) · Deployed von ZCode per SSH · Server-Verwaltung danach: **Hermes**

## Was läuft wo

- **Server:** `root@212.227.73.93` (Ubuntu 24.04, IONOS)
- **Verzeichnis:** `/opt/mylittlecardealership` (Git-Clone von `main`)
- **Domain:** `https://mylittlecardealership.aiconso.eu`
- **Compose:** `docker-compose.vps.yml` (Basis) + `docker-compose.vps-tls.yml` (Traefik/TLS)

Container (Projektname `mylittlecardealership`):

| Container | Aufgabe | Ports |
|---|---|---|
| `mylittlecardealership-db-1` | PostgreSQL 16 | nur intern |
| `mylittlecardealership-api-1` | Fastify-API | nur intern |
| `mylittlecardealership-web-1` | nginx + React-Build | nur intern (80) |
| `mylittlecardealership-backup-1` | tägliches `pg_dump` | – |

**Keine eigenen Host-Ports.** Das Routing macht das bestehende Traefik/Coolify-Setup:
`web` hängt im externen Netz `coolify`, Traefik-Labels mit Präfix `mld-`, Zertifikat
automatisch via Let's Encrypt.

## Was die App kann (kurz)

- **Öffentlich** (ohne Login): Landing `/`, Fahrzeugbörse `/boerse`, Ankauffsformular
  `/ankauf` (Fotos + Fahrzeugausweis, nDSG-Einwilligung, Rate-Limit/Honeypot),
  Impressum/Datenschutz. Anfragen landen als Lead im internen Posteingang und
  lösen eine E-Mail an den Betrieb aus (sofern SMTP konfiguriert).
- **Intern** (Login): Ankauf (Posteingang → Kalkulation → Angebots-/Vertrags-PDF),
  Aufbereitung (Aufträge/Soll-Ist), Verkauf (AS24-Vorbereitung, A3-Tafel mit QR,
  Anfragen/Kalender), Abschluss (Kaufvertrag, **QR-Rechnung**, Leasing, Zahlungen,
  Mahnwesen, Gutschrift, Zusammenfassungs-PDF), Auswertungen + Buchhaltungsexport CSV.
- Uploads liegen im Docker-Volume `uploads` (Fotos öffentlich unter `/uploads/photos`,
  Belege nur authentifiziert) — **nicht** löschen.

## Betreiber-Aufgaben (im System, nicht am Server)

- **QR-IBAN** von der Bank eintragen (Einstellungen → Bank & QR-Rechnung) — erst dann
  erscheint der QR-Zahlteil auf Rechnungen/Mahnungen. Bis dahin: Demo-QR-IBAN im Seed.
- **Impressum/Datenschutz** mit echten Angaben (Name, Adresse, UID) ersetzen —
  `apps/web/src/pages/public/Legal.tsx` (oder vom Entwickler anpassen lassen).
- **SMTP** für den PDF-E-Mail-Versand in die `.env` (`SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) und Container neu starten. Ohne SMTP
  laufen alle Funktionen weiter, Mails werden nur nicht versendet.
- **IMAP-Eingang** (Posteingang-Automatik): Mailbox-Zugang in die `.env`
  (`IMAP_HOST`, `IMAP_PORT` default 993, `IMAP_USER`, `IMAP_PASSWORD`,
  `IMAP_MAILBOX` default INBOX, `IMAP_TLS` default true, `IMAP_POLL_SECONDS`
  default 120) und Container neu starten. Ohne `IMAP_HOST` bleibt der automatische
  E-Mail-Eingang deaktiviert; der Button «Jetzt abholen» im Posteingang meldet das.
- **AutoScout24-Händlerportal-Link** in den Einstellungen hinterlegen (Klick-Link im
  Verkauf-Tab; das Einstellen selbst bleibt manuell).

**Keine eigenen Host-Ports.** Das Routing macht das bestehende Traefik/Coolify-Setup:
`web` hängt im externen Netz `coolify`, Traefik-Labels mit Präfix `mld-`, Zertifikat
automatisch via Let's Encrypt.

## Backups

- Ort: `/opt/mylittlecardealership/backups/mld_YYYYMMDD_HHMMSS.sql.gz`
- Rhythmus: täglich, 30 Tage Vorhalt
- Wiederherstellung:
  ```bash
  cd /opt/mylittlecardealership
  gunzip -c backups/mld_<datum>.sql.gz \
    | docker compose -f docker-compose.vps.yml exec -T db psql -U mld mld
  ```

## Update

```bash
cd /opt/mylittlecardealership
git pull --ff-only
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
docker compose -f docker-compose.vps.yml exec -T api npx prisma db push --skip-generate
```

Nach Schema-Änderungen ggf. Seed erneut laufen lassen (überschreibt keine Passwörter):

```bash
docker compose -f docker-compose.vps.yml exec -T api npx tsx prisma/seed.ts
docker compose -f docker-compose.vps.yml exec -T api npx tsx prisma/seed-demo.ts
```

Demo-Artefakte zurücksetzen (generierte PDFs/Rechnungen/Zahlungen des Demo-Golfs
löschen, Verkaufsvorgang bleibt):

```bash
docker compose -f docker-compose.vps.yml exec -T api npx tsx prisma/clean-demo.ts
```

Hinweis: Der API-Container arbeitet in `/app/apps/api` — die Prisma-Dateien liegen
dort relativ unter `prisma/`.

## Logs / Status

```bash
docker compose -f docker-compose.vps.yml ps
docker compose -f docker-compose.vps.yml logs -f api
docker compose -f docker-compose.vps.yml logs -f web
```

## Bitte nicht ändern

- `.env` nicht committen und nicht löschen (Secrets, DB-Passwort).
- `backups/` nicht löschen.
- Keine Host-Ports für diese App publizieren (80/443/8080 gehören Traefik).
- Bestehende Dienste (Coolify/Traefik, AppFlowy, Gitea, RustDesk, andere Sites) nicht anfassen.
- Schema-Änderungen nur über `prisma db push` (kein `migrations/`-Verzeichnis).

## Zugang

- Login: `chef@mylittlecardealership.ch` / `changeme` — **beim ersten Login ändern**.
- Weitere Demo-Logins: `verkauf@…`, `buchhaltung@…` (jeweils `changeme`).