import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PHOTOS_DIR, isSafeFilename, mimeForFilename } from "../lib/uploads.js";

/**
 * Öffentliche Foto-Auslieferung (ohne Login): Fahrzeugfotos sind Marketing-
 * Material und werden später auch von der öffentlichen Fahrzeugbörse genutzt.
 * Verwaltungs-Dokumente (Fahrzeugausweis …) liegen bewusst in einem anderen
 * Ordner und laufen nur über die authentifizierte Fahrzeug-Route.
 * Dateinamen sind servergeneriert und unveränderlich -> langes Caching ok.
 */
export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/uploads/photos/:filename", async (req, reply) => {
    const { filename } = z
      .object({ filename: z.string().refine(isSafeFilename, "Ungültiger Dateiname") })
      .parse(req.params);
    const full = path.join(PHOTOS_DIR, filename);
    try {
      if (!(await stat(full)).isFile()) throw new Error("not a file");
    } catch {
      return reply.code(404).send({ error: "Nicht gefunden" });
    }
    reply.header("Content-Type", mimeForFilename(filename) ?? "application/octet-stream");
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    return reply.send(createReadStream(full));
  });
}
