import { Injectable } from "@nestjs/common";
import { getMailTransport, sendMail, type MailMessage } from "./transport.js";

export type { MailMessage } from "./transport.js";

@Injectable()
export class MailService {
  async verify(): Promise<void> {
    await getMailTransport().verify();
  }

  async send(message: MailMessage): Promise<void> {
    await sendMail(message);
  }
}
