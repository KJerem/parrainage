import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["test/**/*.e2e-spec.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Un fichier à la fois : base, compteurs de connexion par e-mail et Mailpit sont partagés.
    fileParallelism: false,
    // Les tests appellent eux-mêmes les tâches planifiées, à l'heure qu'ils choisissent.
    env: { SCHEDULER_ENABLED: "false" },
  },
});
