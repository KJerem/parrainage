import { Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "../config/env.js";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Seule pièce jointe permise : le fichier agenda (.ics) d'un appel vidéo. */
  attachments?: { filename: string; content: string; contentType: "text/calendar" }[];
}

let transporter: Transporter | undefined;

const logger = new Logger("Mail");

/** Transport SMTP unique, partagé par MailService et par les e-mails de Better Auth. */
export function getMailTransport(): Transporter {
  if (!transporter) {
    const env = getEnv();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
    });
  }
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  await getMailTransport().sendMail({ from: getEnv().MAIL_FROM, ...message });
}

/**
 * Envoi sans attendre le serveur SMTP. Pour les e-mails d'authentification, la réponse arrive
 * ainsi aussi vite que le compte existe ou non (pas d'énumération par le temps de réponse) et
 * un SMTP en panne ne trahit pas non plus les adresses connues. Les échecs sont journalisés.
 */
export function sendMailInBackground(message: MailMessage): void {
  sendMail(message).catch((error: unknown) => {
    logger.error(
      `Échec de l'envoi « ${message.subject} »`,
      error instanceof Error ? error.stack : String(error),
    );
  });
}
