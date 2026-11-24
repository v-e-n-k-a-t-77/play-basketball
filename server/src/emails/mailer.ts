import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export type Email = { to: string; subject: string; html: string; text: string };

export const sentEmails: Email[] = [];

let transport: Transporter | undefined;

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    ignoreTLS: true,
  });
  return transport;
}

export async function sendEmail(email: Email): Promise<void> {
  switch (env.EMAIL_PROVIDER) {
    case "memory":
      sentEmails.push(email);
      return;
    case "console":
      logger.info({ to: email.to, subject: email.subject, text: email.text }, "Email (console)");
      return;
    case "smtp":
      await getTransport().sendMail({ from: env.EMAIL_FROM, ...email });
      return;
  }
}
