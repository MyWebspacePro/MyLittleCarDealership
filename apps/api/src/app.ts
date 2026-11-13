import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { env } from "./env.js";
import { authRoutes } from "./modules/auth.routes.js";
import { userRoutes } from "./modules/users.routes.js";
import { settingsRoutes } from "./modules/settings.routes.js";
import { contactRoutes } from "./modules/contacts.routes.js";
import { vehicleRoutes } from "./modules/vehicles.routes.js";
import { purchaseRoutes } from "./modules/purchases.routes.js";
import { documentRoutes } from "./modules/documents.routes.js";
import { leadRoutes } from "./modules/leads.routes.js";
import { providerRoutes } from "./modules/providers.routes.js";
import { workOrderRoutes } from "./modules/workorders.routes.js";
import { inquiryRoutes } from "./modules/inquiries.routes.js";
import { appointmentRoutes } from "./modules/appointments.routes.js";
import { salesRoutes } from "./modules/sales.routes.js";
import { mediaRoutes } from "./modules/media.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 10 * 1024 * 1024, // 10 MB (später: Fahrzeugfotos, Dokumente)
    // Nur private Netze vertrauen (Docker/Bridge, Traefik). Damit stimmt
    // req.protocol hinter dem TLS-Traefik, ohne dass X-Forwarded-For von
    // öffentlichen Clients gefälscht werden kann.
    trustProxy: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
  });

  // global: false -> greift nur, wo eine Route es per config.rateLimit einschaltet.
  // hook: preHandler, damit der Body schon geparst ist und der Key auf die
  // E-Mail gelegt werden kann (nicht auf die IP, die sich fälschen liesse).
  await app.register(rateLimit, { global: false, hook: "preHandler" });

  // Refresh-Token liegt in einem httpOnly-Cookie -> braucht Cookie-Parsing.
  await app.register(cookie);

  // Foto-/Dokument-Uploads (ein File pro Request; bodyLimit oben deckt 8 MB
  // pro Datei ab). Multipart-Errors (zu gross, falscher Typ) laufen in den
  // zentralen Error-Handler.
  await app.register(multipart, { limits: { files: 1, fileSize: 8 * 1024 * 1024 } });

  const corsOrigins = env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, cb) => {
      // Kein Origin = curl / Server-zu-Server -> erlauben.
      if (!origin) return cb(null, true);
      return cb(null, corsOrigins.includes(origin));
    },
    credentials: true,
  });

  app.get("/api/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "Validierung fehlgeschlagen",
        details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    if (err.validation) {
      return reply.code(400).send({ error: "Ungültige Anfrage", details: err.message });
    }
    // Prisma-Fehler: die Meldung nennt Modell- und Operationsdetails und darf
    // nicht an den Client gehen. P2025 = passende Zeile fehlt -> 404.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return reply.code(404).send({ error: "Nicht gefunden" });
      }
      req.log.error({ prismaCode: err.code }, err.message);
      return reply.code(409).send({ error: "Datensatz konnte nicht gespeichert werden" });
    }
    req.log.error(err);
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    if (status >= 500) return reply.code(500).send({ error: "Interner Fehler" });
    return reply.code(status).send({ error: err.message || "Fehler" });
  });

  // Öffentliche Foto-Auslieferung (kein Login; ohne /api-Präfix, weil nginx
  // /uploads/ direkt hierher weiterleitet).
  await app.register(mediaRoutes);
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api" });
  await app.register(settingsRoutes, { prefix: "/api" });
  await app.register(contactRoutes, { prefix: "/api" });
  await app.register(vehicleRoutes, { prefix: "/api" });
  await app.register(purchaseRoutes, { prefix: "/api" });
  await app.register(documentRoutes, { prefix: "/api" });
  await app.register(leadRoutes, { prefix: "/api" });
  await app.register(providerRoutes, { prefix: "/api" });
  await app.register(workOrderRoutes, { prefix: "/api" });
  await app.register(inquiryRoutes, { prefix: "/api" });
  await app.register(appointmentRoutes, { prefix: "/api" });
  await app.register(salesRoutes, { prefix: "/api" });

  return app;
}