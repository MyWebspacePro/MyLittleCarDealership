# Projektregeln für KI-Agenten

Diese Regeln gelten verbindlich für alle Änderungen an diesem Repository.

## Datenbank

- **Kein `migrations/`-Verzeichnis.** Schema-Änderungen laufen über `prisma db push`.
- `prisma/seed.ts` ist idempotent und **überschreibt keine Passwörter** bestehender
  Benutzer (nur beim Anlegen gesetzt). Trotzdem nicht achtlos ausführen.
- Auf dem Server `db push` **nach** `up -d --build` im laufenden `api`-Container
  ausführen, sonst arbeitet der Befehl mit dem alten Image.

## Sicherheit

- `.env` und `apps/api/.env` werden nie committet. Auf dem Server liegt eine eigene `.env`.
- Access-Token nicht in `localStorage` speichern. Refresh-Token nur als httpOnly-Cookie.
- Neue Routen: `authGuard` (eingeloggt) bzw. `requireRole("ADMIN")` setzen.
  Änderungen an Benutzern/Einstellungen immer mit `audit()` protokollieren.
- Passwörter mit `bcrypt.hash(..., 10)`.

## Code

- Backend: ESM, relative Imports mit `.js`-Endung (NodeNext).
- Eingaben serverseitig mit `zod` validieren; Fehler als 400 mit Details.
- Neue Module als `apps/api/src/modules/<name>.routes.ts` und in `app.ts` registrieren.
- Frontend: Tailwind-Klassen, Komponenten aus `components/ui.tsx` wiederverwenden.
- Zahlen aus Prisma-Decimal-Feldern vor der JSON-Ausgabe mit `Number()` umwandeln.

## Deploy

- Server: `ssh -i ~/.ssh/werkstatt_vps root@212.227.73.93`, Verzeichnis `/opt/mylittlecardealership`.
- Deploy: `docker-compose.vps.yml` + `docker-compose.vps-tls.yml` (Traefik/Coolify).
- Keine eigenen Host-Ports (80/443/8080 gehören Traefik). Bestehende Server-Dienste nicht anfassen.
- `.env` auf dem Server enthält Zufallssecrets; nicht in Logs oder Chat ausgeben.

## Git

- Repo: `https://github.com/MyWebspacePro/MyLittleCarDealership` (public, `main`).
- Falls ein Push am `osxkeychain`-Helper hängt:
  ```bash
  GIT_TERMINAL_PROMPT=0 git push \
    https://x-access-token:$(gh auth token)@github.com/MyWebspacePro/MyLittleCarDealership.git main
  ```
- Commit-Nachrichten konventionell (`feat:`, `fix:`, `docs:`, `chore:`).

## Verifikation vor Deploy

1. `npm run build` (Typecheck + Build beider Apps)
2. `docker compose -f docker-compose.prod.yml up -d --build` → `http://localhost:8080`
3. Smoke: `/api/health` 200, Login 200, `/api/users` ohne Token 401
4. Danach: `docker compose -f docker-compose.prod.yml down -v`