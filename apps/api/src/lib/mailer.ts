import nodemailer from "nodemailer";
import { env } from "../env.js";

// SMTP erst beim ersten Senden verbinden -> die App startet auch ohne Mailserver.
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export interface MailAttachment {
  filename: string;
  path: string;
}

/** E-Mail senden; PDFs/Belege optional als Anhang (Rechnung, Mahnung …). */
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  attachments?: MailAttachment[],
): Promise<void> {
  await getTransporter().sendMail({ from: env.SMTP_FROM, to, subject, text, attachments });
}