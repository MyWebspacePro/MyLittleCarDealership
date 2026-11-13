# VPS-Übergabe: MyLittleCarDealership

Stand: 13.11.2026 · Deployed von ZCode per SSH · Server-Verwaltung danach: **Hermes**

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
```

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