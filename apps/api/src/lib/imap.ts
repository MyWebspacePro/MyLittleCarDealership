import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { prisma } from "./prisma.js";
import { env } from "../env.js";
import { saveUpload, EMAIL_ATTACHMENTS_DIR } from "./uploads.js";
import { sendMail } from "./mailer.js";

// E-Mail-Eingang (Phase H): ungelesene Mails aus dem IMAP-Postfach werden
// geholt, als EmailLog gespeichert (Dedupe über Message-ID), der Absender
// gegen die Kontakte gematcht (ohne Treffer: neuer Kontakt) und die
// Kommunikation in der CRM-Historie des Kunden vermerkt. WhatsApp und
// Telefon bleiben bewusst manuell — nur E-Mail und Webformular sind Automatik.

export interface IncomingEmail {
  messageId: string;
  fromName: string | null;
  fromEmail: string;
  subject: string | null;
  body: string | null;
  receivedAt: Date;
  attachments: { filename: string; buffer: Buffer; mimetype: string }[];
}

export function imapConfigured(): boolean {
  return Boolean(env.IMAP_HOST);
}

/** Namen aus dem From-Header in Vor-/Nachname zerlegen. */
function splitName(name: string | null): { firstName: string | null; lastName: string | null } {
  const trimmed = name?.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null };
}

/** Eine eingehende E-Mail verarbeiten: Dedupe → Kontakt-Match → EmailLog + CRM-Eintrag. */
export async function processIncomingEmail(email: IncomingEmail): Promise<{ emailLogId: string; isNewContact: boolean }> {
  const existing = await prisma.emailLog.findUnique({ where: { messageId: email.messageId } });
  if (existing) return { emailLogId: existing.id, isNewContact: false };

  let contact = email.fromEmail
    ? await prisma.contact.findFirst({ where: { email: { equals: email.fromEmail, mode: "insensitive" } } })
    : null;
  let isNewContact = false;
  if (!contact) {
    const { firstName, lastName } = splitName(email.fromName);
    contact = await prisma.contact.create({
      data: { type: "PRIVAT", firstName, lastName, email: email.fromEmail || null },
    });
    isNewContact = true;
  }

  const attachments: string[] = [];
  for (const attachment of email.attachments.slice(0, 9)) {
    try {
      attachments.push(await saveUpload(EMAIL_ATTACHMENTS_DIR, attachment.buffer, attachment.mimetype));
    } catch {
      // Nicht speicherbare Anlagen (falscher Typ, zu gross) überspringen —
      // die Mail selbst ist trotzdem im Posteingang.
    }
  }

  const emailLog = await prisma.emailLog.create({
    data: {
      messageId: email.messageId,
      fromName: email.fromName,
      fromEmail: email.fromEmail,
      subject: email.subject,
      body: email.body,
      receivedAt: email.receivedAt,
      contactId: contact.id,
      isNewContact,
      attachments,
    },
  });
  await prisma.communicationLog.create({
    data: {
      contactId: contact.id,
      channel: "EMAIL",
      direction: "EINGANG",
      subject: email.subject,
      body: email.body,
      occurredAt: email.receivedAt,
      source: "EMAIL",
      emailLogId: emailLog.id,
    },
  });

  // Betrieb benachrichtigen (sofern SMTP + Betriebs-E-Mail konfiguriert).
  try {
    const settings = await prisma.setting.findUnique({ where: { id: 1 } });
    if (settings?.email) {
      await sendMail(
        settings.email,
        `Neue E-Mail von ${email.fromName ?? email.fromEmail}: ${email.subject ?? "(kein Betreff)"}`.slice(0, 190),
        [
          `Von: ${email.fromName ?? ""} <${email.fromEmail}>`,
          `Betreff: ${email.subject ?? "—"}`,
          "",
          email.body?.slice(0, 2000) || "(kein Text)",
          "",
          `Im System: Posteingang → E-Mails (${attachments.length} Anhang/Anhänge)`,
        ].join("\n"),
      );
    }
  } catch {
    // SMTP-Fehler dürfen den Import nicht kippen.
  }
  return { emailLogId: emailLog.id, isNewContact };
}

/** ParsedMail in unser Format überführen. */
function fromParsed(parsed: ParsedMail): IncomingEmail | null {
  const messageId = parsed.messageId;
  if (!messageId) return null;
  const address = parsed.from?.value?.[0];
  return {
    messageId,
    fromName: address?.name?.trim() || null,
    fromEmail: address?.address ?? "",
    subject: parsed.subject ?? null,
    body: parsed.text ?? null,
    receivedAt: parsed.date ?? new Date(),
    attachments: (parsed.attachments ?? [])
      .filter((a) => a.content && a.content.length > 0)
      .map((a) => ({
        filename: a.filename ?? "anhang",
        buffer: a.content,
        mimetype: a.contentType ?? "application/octet-stream",
      })),
  };
}

/** Alle ungelesenen Mails aus dem IMAP-Postfach holen und verarbeiten. */
export async function pollImap(): Promise<{ imported: number; skipped?: string; errors: number }> {
  if (!imapConfigured()) {
    return { imported: 0, skipped: "IMAP nicht konfiguriert (IMAP_HOST fehlt)", errors: 0 };
  }
  const client = new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: env.IMAP_TLS,
    auth: { user: env.IMAP_USER, pass: env.IMAP_PASSWORD },
    logger: false,
  });
  let imported = 0;
  let errors = 0;
  await client.connect();
  const lock = await client.getMailboxLock(env.IMAP_MAILBOX);
  try {
    for await (const message of client.fetch({ seen: false }, { uid: true, source: true })) {
      try {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const email = fromParsed(parsed);
        if (!email) continue;
        await processIncomingEmail(email);
        await client.messageFlagsAdd({ uid: message.uid }, ["\\Seen"], { uid: true });
        imported += 1;
      } catch {
        errors += 1;
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { imported, errors };
}
