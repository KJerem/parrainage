import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_APP_NOW, E2E_SEED_TODAY } from "./e2e/clock";

// Ports dédiés (3100 et 4100) : les tests tournent à côté de `npm run dev` (3000 et 4000).
// E2E_PORT et E2E_API_PORT permettent de contourner un port déjà occupé sur le poste.
const port = Number(process.env.E2E_PORT ?? 3100);
const apiPort = Number(process.env.E2E_API_PORT ?? 4100);
const baseURL = `http://localhost:${port}`;
const apiURL = `http://localhost:${apiPort}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  // Remet la base de développement dans l'état du seed, calé sur le jour du design
  // (SEED_TODAY = E2E_SEED_TODAY, voir e2e/global-setup.ts et e2e/clock.ts).
  globalSetup: "./e2e/global-setup.ts",
  metadata: { appNow: E2E_APP_NOW, seedToday: E2E_SEED_TODAY },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  // Builds de production des deux serveurs. Le web est construit pour l'origine des tests :
  // l'API la déclare de confiance (APP_URL) et bâtit les liens des e-mails à partir d'elle.
  webServer: [
    {
      name: "api",
      // Lancée depuis apps/api pour lire apps/api/.env (base, SMTP, secret).
      command: "npm run build -w @parrainage/api && node dist/main.js",
      cwd: path.join(__dirname, "..", "api"),
      url: `${apiURL}/api/health?light`,
      // APP_NOW : horloge figée sur le jour du design, le même que celui du seed (e2e/clock.ts).
      env: {
        PORT: String(apiPort),
        APP_URL: baseURL,
        APP_NOW: E2E_APP_NOW,
        SCHEDULER_ENABLED: "false",
      },
      // Une API déjà lancée sur ce port ferait confiance à une autre origine : jamais réutilisée.
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      name: "web",
      command: `npm run build && npx next start -p ${port}`,
      url: baseURL,
      // SHOW_DEV_UI ouvre /dev/ui aux tests ; FEED_PAGE_SIZE=1 fait paginer « Tout le fil »
      // avec les quelques éléments du seed.
      env: {
        SHOW_DEV_UI: "1",
        FEED_PAGE_SIZE: "1",
        API_INTERNAL_URL: apiURL,
        NEXT_PUBLIC_APP_URL: baseURL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile-390",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
});
