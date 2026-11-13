import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Uploads-Ordner. Im Container via UPLOADS_DIR gesetzt (Docker-Volume),
// lokal liegt er neben dem API-Verzeichnis. Fotos werden öffentlich über
// /uploads/photos/<datei> ausgeliefert (später auch für die Fahrzeugbörse),
// Verwaltungs-Dokumente (Fahrzeugausweis …) nur über authentifizierte Route.
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "uploads");
export const PHOTOS_DIR = path.join(UPLOADS_DIR, "photos");
export const DOCS_DIR = path.join(UPLOADS_DIR, "docs");
// Lead-Posteingang: Fotos öffentlich, Fahrzeugausweis & sonstige Belege privat.
export const LEADS_PHOTOS_DIR = path.join(UPLOADS_DIR, "leads", "photos");
export const LEADS_DOCS_DIR = path.join(UPLOADS_DIR, "leads", "docs");
// Server-generierte PDFs (Angebote, Verträge, Rechnungen, Tafeln …) — privat.
export const DOCUMENTS_DIR = path.join(UPLOADS_DIR, "documents");
// Anhänge eingehender E-Mails (IMAP-Posteingang) — privat, nur authentifiziert.
export const EMAIL_ATTACHMENTS_DIR = path.join(UPLOADS_DIR, "email-attachments");

export const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB pro Datei

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic", // iPhone-Foto; Anzeige je nach Browser
  "image/heif": ".heif",
  "application/pdf": ".pdf",
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".pdf": "application/pdf",
};

export class UploadError extends Error {
  status = 400;
}

export async function saveUpload(
  dir: string,
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const ext = EXT_BY_MIME[mimetype];
  if (!ext) throw new UploadError("Dateityp nicht erlaubt (JPG, PNG, WebP, HEIC oder PDF)");
  if (buffer.byteLength > MAX_FILE_BYTES) throw new UploadError("Datei zu gross (max. 8 MB)");
  await mkdir(dir, { recursive: true });
  // Zeitstempel-Praefix + kurze UUID: eindeutig, grob chronologisch sortierbar,
  // nie dasselbe Ziel wie eine bestehende Datei (Cache-freundlich).
  const filename = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return filename;
}

/** Server-generierte Datei (z. B. PDF) mit fester Endung ablegen. */
export async function saveGeneratedFile(dir: string, buffer: Buffer, ext = ".pdf"): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}${ext}`;
  await writeFile(path.join(dir, filename), buffer);
  return filename;
}

/** Client-Dateinamen strikt prüfen — kein Pfad-Traversal, keine Sonderzeichen. */
export function isSafeFilename(filename: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(filename) && !filename.includes("..");
}

export function mimeForFilename(filename: string): string | undefined {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()];
}

/** Originalname ohne Verzeichnisanteile und gekürzt speichern. */
export function sanitizeOriginalName(name: string | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop() ?? "";
  return base ? base.slice(0, 200) : null;
}
