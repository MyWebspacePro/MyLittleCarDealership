# Deploy

## VPS (Traefik / Coolify)

Der Server hat bereits Coolify + Traefik. Die App bekommt **keine eigenen Host-Ports**;
das Routing übernimmt Traefik mit Let's Encrypt.

### Einmalig aufsetzen

```bash
ssh -i ~/.ssh/werkstatt_vps root@212.227.73.93

git clone https://github.com/MyWebspacePro/MyLittleCarDealership.git /opt/mylittlecardealership
cd /opt/mylittlecardealership

# Domain + Zufallsgeheimnisse setzen, bauen, starten, Schema + Seed
bash deploy.sh mylittlecardealership.aiconso.eu
```

`deploy.sh` erledigt:
1. `.env` aus `.env.production.example` (falls nicht vorhanden)
2. `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` mit `openssl rand`
3. `APP_DOMAIN` und `CORS_ORIGINS` auf die Domain setzen
4. `docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build`
5. `prisma db push` und `tsx prisma/seed.ts` **im laufenden API-Container**

Voraussetzung: A-Record der Domain zeigt auf den Server. Das Let's-Encrypt-Zertifikat
stellt Traefik danach automatisch aus.

### Smoke-Test

```bash
curl -s https://mylittlecardealership.aiconso.eu/api/health
# → {"ok":true,...}

curl -s -X POST https://mylittlecardealership.aiconso.eu/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"chef@mylittlecardealership.ch","password":"changeme"}'
# → 200 + accessToken

curl -s -o /dev/null -w '%{http_code}\n' \
  https://mylittlecardealership.aiconso.eu/api/users
# → 401 (ohne Token)
```

Danach im Browser einloggen und das Standard-Passwort ändern.

### Update

```bash
cd /opt/mylittlecardealership
git pull --ff-only
docker compose -f docker-compose.vps.yml -f docker-compose.vps-tls.yml up -d --build
docker compose -f docker-compose.vps.yml exec -T api npx prisma db push --skip-generate
```

Wichtig: `db push` **nach** `up -d --build` ausführen, damit das neue Image verwendet wird.

### Restore

```bash
cd /opt/mylittlecardealership
gunzip -c backups/mld_<datum>.sql.gz \
  | docker compose -f docker-compose.vps.yml exec -T db psql -U mld mld
```

Backups liegen unter `/opt/mylittlecardealership/backups/` (täglich, 30 Tage Vorhalt).

### Logs

```bash
docker compose -f docker-compose.vps.yml logs -f api
docker compose -f docker-compose.vps.yml logs -f web
docker compose -f docker-compose.vps.yml ps
```

## Lokaler Vollständiger Test (nginx + API + DB)

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec -T api npx prisma db push --skip-generate
docker compose -f docker-compose.prod.yml exec -T api npx tsx prisma/seed.ts
# → http://localhost:8080
```

Eigene Datenbank (`mld_db_data`), getrennt von der Entwicklungs-DB.
Danach: `docker compose -f docker-compose.prod.yml down -v`.