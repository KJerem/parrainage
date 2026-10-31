import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "../config/env.js";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.transporter = nodemailer.createTransport({
      host: config.get("SMTP_HOST", { infer: true }),
      port: config.get("SMTP_PORT", { infer: true }),
      secure: false,
    });
    this.from = config.get("MAIL_FROM", { infer: true });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
