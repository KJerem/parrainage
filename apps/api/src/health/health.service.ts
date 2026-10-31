import { Injectable } from "@nestjs/common";
import { MailService } from "../mail/mail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";

export type ServiceStatus = "ok" | "erreur";

export interface HealthReport {
  healthy: boolean;
  services: { db: ServiceStatus; s3: ServiceStatus; smtp: ServiceStatus };
}

const TIMEOUT_MS = 3000;

async function probe(run: () => Promise<unknown>): Promise<ServiceStatus> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch {
    return "erreur";
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async check(): Promise<HealthReport> {
    const [db, s3, smtp] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.storage.ping()),
      probe(() => this.mail.verify()),
    ]);
    const services = { db, s3, smtp };
    return { healthy: Object.values(services).every((s) => s === "ok"), services };
  }
}
