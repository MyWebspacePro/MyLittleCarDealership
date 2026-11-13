import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LEADS_PHOTOS_DIR, PHOTOS_DIR, isSafeFilename, mimeForFilename } from "../lib/uploads.js";

/**
 * Öffentliche Foto-Auslieferung (ohne Login): Fahrzeugfotos und Lead-Fotos
 * sind Marketing-/Prüfungsmaterial und werden später auch von der öffentlichen
 * Fahrzeugbörse genutzt. Belege (Fahrzeugausweis u. a.) liegen bewusst in
 * anderen Ordnern und laufen nur über authentifizierte Routen.
 * Dateinamen sind servergeneriert und unveränderlich -> langes Caching ok.
 */
async function servePhoto(dir: string, filename: string, reply: import("fastify").FastifyReply) {
  const full = path.join(dir, filename);
  try {
    if (!(await stat(full)).isFile()) throw new Error("not a file");
  } catch {
    return reply.code(404).send({ error: "Nicht gefunden" });
  }
  reply.header("Content-Type", mimeForFilename(filename) ?? "application/octet-stream");
  reply.header("Cache-Control", "public, max-age=31536000, immutable");
  return reply.send(createReadStream(full));
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  const filenameSchema = z.object({ filename: z.string().refine(isSafeFilename, "Ungültiger Dateiname") });

  app.get("/uploads/photos/:filename", async (req, reply) => {
    const { filename } = filenameSchema.parse(req.params);
    return servePhoto(PHOTOS_DIR, filename, reply);
  });

  // Lead-Fotos (Erstkontakt), öffentlich ausgeliefert.
  app.get("/uploads/leads/:filename", async (req, reply) => {
    const { filename } = filenameSchema.parse(req.params);
    return servePhoto(LEADS_PHOTOS_DIR, filename, reply);
  });
}
