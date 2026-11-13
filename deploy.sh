#!/usr/bin/env bash
# Ein-Befehl-Setup für einen frischen Server (oder eine Demo).
#   bash deploy.sh [domain]
# Ohne Domain startet nur die Basis (Zugriff über die Server-IP:8080 im prod-Test,
# auf dem VPS ohne Traefik-Labels). Mit Domain zusätzlich TLS-Routing.
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN="${1:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker wird installiert ..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "→ .env aus .env.production.example erstellt"
fi

# Setzt einen Wert in .env, ohne die Datei doppelt zu schreiben (BSD/GNU-tauglich).
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then
    sed -E "s|^${key}=.*|${key}=${value}|" .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

get_env() {
  grep -E "^$1=" .env | head -n1 | cut -d= -f2-
}

# Passwort nur erzeugen, wenn noch der Platzhalter drinsteht.
if grep -q "HIER-STARKES-PASSWORT" .env; then
  PGPW="$(openssl rand -hex 16)"
  PGUSER="$(get_env POSTGRES_USER)"; PGUSER="${PGUSER:-mld}"
  PGDB="$(get_env POSTGRES_DB)"; PGDB="${PGDB:-mld}"
  set_env POSTGRES_PASSWORD "$PGPW"
  set_env DATABASE_URL "postgresql://${PGUSER}:${PGPW}@db:5432/${PGDB}"
  echo "→ Datenbank-Passwort erzeugt"
fi

if grep -q "HIER-MIT-OPENSSL-RAND-HEX-32-ERZEUGEN" .env; then
  set_env JWT_SECRET "$(openssl rand -hex 32)"
  set_env JWT_REFRESH_SECRET "$(openssl rand -hex 32)"
  echo "→ JWT-Secrets erzeugt"
fi

if [ -n "$DOMAIN" ]; then
  set_env APP_DOMAIN "$DOMAIN"
  set_env CORS_ORIGINS "https://${DOMAIN}"
  set_env SMTP_FROM "MyLittleCarDealership <noreply@${DOMAIN}>"
  echo "→ Domain gesetzt: $DOMAIN"
fi

APP_DOMAIN="$(get_env APP_DOMAIN)"

COMPOSE="docker compose -f docker-compose.vps.yml"
if [ -n "$APP_DOMAIN" ] && [ "$APP_DOMAIN" != "deine-domain.ch" ]; then
  COMPOSE="$COMPOSE -f docker-compose.vps-tls.yml"
fi

echo "→ Baue und starte Container ..."
$COMPOSE up -d --build

echo "→ Datenbank-Schema anwenden ..."
$COMPOSE exec -T api npx prisma db push --skip-generate

echo "→ Seed einspielen ..."
$COMPOSE exec -T api npx tsx prisma/seed.ts

echo
echo "Fertig."
if [ -n "$APP_DOMAIN" ] && [ "$APP_DOMAIN" != "deine-domain.ch" ]; then
  echo "  https://${APP_DOMAIN}"
else
  echo "  Ohne Domain: docker compose -f docker-compose.vps.yml ps"
fi
echo "  Login: chef@mylittlecardealership.ch / changeme — PASSWORT SOFORT ÄNDERN!"