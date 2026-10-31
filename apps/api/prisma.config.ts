import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Valeur de repli : permet `prisma generate` sans .env (clone neuf, build Docker).
    url: process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build",
  },
});
