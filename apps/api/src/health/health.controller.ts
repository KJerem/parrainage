import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { HealthService } from "./health.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async check(
    @Query("light") light: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Sonde légère utilisée par le mode hors ligne : répond sans interroger les services.
    if (light !== undefined) {
      return { app: "ok" };
    }
    const report = await this.health.check();
    if (!report.healthy) {
      res.status(503);
    }
    return report.services;
  }
}
