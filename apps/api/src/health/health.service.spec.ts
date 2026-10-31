import { Test } from "@nestjs/testing";
import { MailService } from "../mail/mail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StorageService } from "../storage/storage.service.js";
import { HealthService } from "./health.service.js";

async function createService(overrides: {
  db?: () => Promise<unknown>;
  s3?: () => Promise<void>;
  smtp?: () => Promise<void>;
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthService,
      { provide: PrismaService, useValue: { $queryRaw: overrides.db ?? (async () => [1]) } },
      { provide: StorageService, useValue: { ping: overrides.s3 ?? (async () => undefined) } },
      { provide: MailService, useValue: { verify: overrides.smtp ?? (async () => undefined) } },
    ],
  }).compile();
  return moduleRef.get(HealthService);
}

describe("HealthService", () => {
  it("signale tous les services opérationnels", async () => {
    const service = await createService({});
    await expect(service.check()).resolves.toEqual({
      healthy: true,
      services: { db: "ok", s3: "ok", smtp: "ok" },
    });
  });

  it("isole le service en panne", async () => {
    const service = await createService({
      s3: async () => {
        throw new Error("bucket absent");
      },
    });
    await expect(service.check()).resolves.toEqual({
      healthy: false,
      services: { db: "ok", s3: "erreur", smtp: "ok" },
    });
  });

  it("considère un service trop lent comme en erreur", async () => {
    vi.useFakeTimers();
    try {
      const service = await createService({ smtp: () => new Promise(() => undefined) });
      const pending = service.check();
      await vi.advanceTimersByTimeAsync(3000);
      await expect(pending).resolves.toMatchObject({
        healthy: false,
        services: { smtp: "erreur" },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
