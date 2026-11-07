import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Env } from "../config/env.js";
import { NewsService } from "../relais/news.service.js";
import { UploadsCleanupService } from "../uploads/cleanup.js";

/**
 * Tâches planifiées : publication des nouvelles programmées et purge des fichiers sans usage.
 * SCHEDULER_ENABLED=false les coupe (tests, instance secondaire). Une erreur est journalisée et
 * le passage suivant réessaie : rien de ce qui est dû n'est perdu.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly news: NewsService,
    private readonly cleanup: UploadsCleanupService,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get("SCHEDULER_ENABLED", { infer: true });
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: "news-publication", waitForCompletion: true })
  async publishNews(): Promise<void> {
    await this.run("publication des nouvelles", () => this.news.publishDue());
  }

  @Cron(CronExpression.EVERY_HOUR, { name: "uploads-cleanup", waitForCompletion: true })
  async purgeUploads(): Promise<void> {
    await this.run("purge des fichiers", () => this.cleanup.purgeStale());
  }

  private async run(label: string, task: () => Promise<number>): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const done = await task();
      if (done > 0) {
        this.logger.log(`${label} : ${done}`);
      }
    } catch (error) {
      this.logger.error(`Échec : ${label}`, error instanceof Error ? error.stack : String(error));
    }
  }
}
