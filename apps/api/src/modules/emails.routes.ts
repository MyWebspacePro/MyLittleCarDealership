import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { authGuard, requireRole } from "../plugins/auth.js";
import { pollImap, processIncomingEmail, imapConfigured } from "../lib/imap.js";
import { readFile } from "node:fs/promises";
import {
  EMAIL_ATTACHMENTS_DIR,
  LEADS_DOCS_DIR,
  LEADS_PHOTOS_DIR,
  isSafeFilename,
  mimeForFilename,
  saveUpload,
} from "../lib/uploads.js";
import { contactDisplayName } from "./contacts.routes.js";

// Posteingang-E-Mails (Phase H): Liste der abgeholt E-Mails, manuelles
// Nachholen, Zuordnen und Übernehmen als Ankaufsanfrage. Die Automatik
// selbst (IMAP-Poller) läuft in lib/imap.ts + server.ts.

function serialize(email: {
  id: string;
  messageId: string;
  fromName: string | null;
  fromEmail: string;
  subject: string | null;
  body: string | null;
  receivedAt: Date;
  status: string;
  isNewContact: boolean;
  attachments: string[];
  contactId: string | null;
  contact: { type: "PRIVAT" | "FIRMA"; firstName: string | null; lastName: string | null; companyName: string | null } | null;
}) {
  return {
    id: email.id,
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    subject: email.subject,
    body: email.body,
    receivedAt: email.receivedAt,
    status: email.status,
    isNewContact: email.isNewContact,
    attachments: email.attachments,
    contactId: email.contactId,
    contactName: email.contact ? contactDisplayName(email.contact) : null,
  };
}

const emailInclude = {
  contact: { select: { type: true, firstName: true, lastName: true, companyName: true } },
} as const;

export async function emailRoutes(app: FastifyInstance): Promise<void> {
  app.get("/emails", { preHandler: authGuard }, async (req) => {
    const { status } = z
      .object({ status: z.enum(["NEU", "GESEHEN", "ZUGEORDNET"]).optional() })
      .parse(req.query ?? {});
    const emails = await prisma.emailLog.findMany({
      where: status ? { status } : undefined,
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: emailInclude,
    });
    return emails.map(serialize);
  });

  // Manuell nachholen — auch ohne Poll-Interval (oder zum Testen).
  app.post("/emails/fetch-now", { preHandler: authGuard }, async (req) => {
    const result = await pollImap();
    await audit(req.user!.id, "EMAILS_FETCH", "EmailLog", undefined, result);
    return { ...result, configured: imapConfigured() };
  });

  // Test-Vermittler: dieselbe Verarbeitungspipeline mit einer synthetischen
  // Mail — damit ist der Posteingang ohne echte Mailbox verifizierbar.
  app.post("/emails/simulate", { preHandler: [authGuard, requireRole("ADMIN")] }, async (req, reply) => {
    const body = z
      .object({
        fromName: z.string().trim().max(120).default("Test Absender"),
        fromEmail: z.string().trim().email(),
        subject: z.string().trim().max(200).default("Test-E-Mail"),
        body: z.string().max(8000).default("Dies ist eine simulierte E-Mail."),
      })
      .parse(req.body ?? {});
    const result = await processIncomingEmail({
      messageId: `<sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@mylittlecardealership.local>`,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
      subject: body.subject,
      body: body.body,
      receivedAt: new Date(),
      attachments: [],
    });
    const emailLog = await prisma.emailLog.findUnique({ where: { id: result.emailLogId }, include: emailInclude });
    await audit(req.user!.id, "EMAILS_SIMULATE", "EmailLog", result.emailLogId);
    return reply.code(201).send({ ...serialize(emailLog!), isNewContact: result.isNewContact });
  });

  // Als gelesen markieren (verschwindet aus der "NEU"-Fokusliste).
  app.put("/emails/:id/seen", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const email = await prisma.emailLog.update({ where: { id }, data: { status: "GESEHEN" }, include: emailInclude });
    await audit(req.user!.id, "EMAIL_SEEN", "EmailLog", id);
    return serialize(email);
  });

  // Als Ankaufsanfrage übernehmen: Lead aus der Mail erzeugen, Anhänge
  // als Lead-Dateien kopieren, E-Mail als ZUGEORDNET markieren.
  app.post("/emails/:id/convert", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const email = await prisma.emailLog.findUnique({ where: { id }, include: emailInclude });
    if (!email) return reply.code(404).send({ error: "E-Mail nicht gefunden" });
    if (email.status === "ZUGEORDNET") return reply.code(409).send({ error: "Diese E-Mail ist bereits zugeordnet." });

    const sellerName =
      email.contact && email.contactId
        ? contactDisplayName(email.contact)
        : email.fromName ?? email.fromEmail;
    const lead = await prisma.purchaseLead.create({
      data: {
        status: "NEU",
        channel: "EMAIL",
        sellerName,
        sellerEmail: email.fromEmail || null,
        message: [email.subject ? `Betreff: ${email.subject}` : null, email.body].filter(Boolean).join("\n\n").slice(0, 8000) || null,
      },
    });

    // Anhänge physisch in die Lead-Ordner kopieren (Lead-Dateien sind je
    // nach Art öffentlich aus /uploads/leads/… ausgeliefert).
    for (const filename of email.attachments) {
      if (!isSafeFilename(filename)) continue;
      const full = path.join(EMAIL_ATTACHMENTS_DIR, filename);
      const buffer = await readFile(full).catch(() => null);
      if (!buffer) continue;
      const mime = mimeForFilename(filename) ?? "application/octet-stream";
      const kind = mime.startsWith("image/") ? "FOTO" : "SONSTIGES";
      const newFilename = await saveUpload(kind === "FOTO" ? LEADS_PHOTOS_DIR : LEADS_DOCS_DIR, buffer, mime);
      await prisma.leadFile.create({
        data: { leadId: lead.id, kind, filename: newFilename, originalName: filename },
      });
    }
    const updated = await prisma.emailLog.update({ where: { id }, data: { status: "ZUGEORDNET" }, include: emailInclude });
    await audit(req.user!.id, "EMAIL_CONVERT", "PurchaseLead", lead.id, { emailId: id });
    return { lead, email: serialize(updated) };
  });

  // E-Mail-Eintrag löschen (z. B. Spam).
  app.delete("/emails/:id", { preHandler: authGuard }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.emailLog.delete({ where: { id } });
    await audit(req.user!.id, "DELETE", "EmailLog", id);
    return reply.code(204).send();
  });

  // Anhang herunterladen (privat, authentifiziert).
  app.get("/emails/:id/attachments/:index", { preHandler: authGuard }, async (req, reply) => {
    const { id, index } = z
      .object({ id: z.string().min(1), index: z.coerce.number().int().min(0) })
      .parse(req.params);
    const email = await prisma.emailLog.findUnique({ where: { id } });
    if (!email) return reply.code(404).send({ error: "E-Mail nicht gefunden" });
    const filename = email.attachments[index];
    if (!filename || !isSafeFilename(filename)) return reply.code(404).send({ error: "Anhang nicht gefunden" });
    const full = path.join(EMAIL_ATTACHMENTS_DIR, filename);
    if (!(await stat(full).then((s) => s.isFile()).catch(() => false))) {
      return reply.code(404).send({ error: "Datei nicht gefunden" });
    }
    reply.header("Content-Type", mimeForFilename(filename) ?? "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return reply.send(createReadStream(full));
  });
}
