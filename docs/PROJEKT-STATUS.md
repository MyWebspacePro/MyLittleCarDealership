# Projekt-Status

Stand: 13.11.2026

## Live

- https://mylittlecardealership.aiconso.eu (VPS, Traefik/TLS, Docker Compose)

## Enthalten (Grundgerüst)

- Login mit Zwei-Token-Auth (Access-JWT 15 min, Refresh-JWT 30 Tage als httpOnly-Cookie,
  Session-Tabelle mit Rotation und Diebstahl-Erkennung)
- Benutzerverwaltung: anlegen, bearbeiten, deaktivieren; Rollen ADMIN / SALES / FINANCE;
  Schutz des letzten aktiven Administrators und des eigenen Kontos
- Betriebs-Stammdaten (Firma, Adresse, MWST, Bank, Zahlungsziel) — ADMIN-schreibgeschützt
- Audit-Log für sicherheitsrelevante Aktionen
- Dashboard mit Team-, Rollen- und Betriebsüberblick
- Profilseite mit Passwortwechsel
- Docker: Entwicklung (DB + Mailhog), VPS (Traefik), lokaler Vollständiger Test (Port 8080)
- Tägliches Backup (pg_dump, 30 Tage)

## Demo-Daten

- Musterhändler „MyLittleCarDealership Muster AG“
- Logins: `chef@…` (ADMIN), `verkauf@…` (SALES), `buchhaltung@…` (FINANCE) · Passwort `changeme`

## Offen / als Nächstes

- **Fach-Spezifikationen** des Nutzers abwarten, danach:
  - Datenmodelle (Fahrzeuge, Kunden, Angebote, Rechnungen, ...) ergänzen
  - Fachmodule in API und UI umsetzen
  - `prisma/seed-demo.ts` mit realistischen Demo-Daten (1:1 auf den VPS spiegeln)
  - ggf. Fahrzeugfotos/Uploads, PDF-Generierung, Exposé-Export

## Verifiziert

- API-Smoke: Health 200, Login 200, geschützte Route 401/200, falsches Passwort 401
- UI: Login, Dashboard, Team, Einstellungen, Profil (Desktop + mobil, kein Overflow)
- `npm run build` fehlerfrei
- Docker-Vollständiger Test: nginx → API → PostgreSQL auf Port 8080, Login über nginx 200
- VPS-Deploy: Health/Login/SPA über HTTPS 200