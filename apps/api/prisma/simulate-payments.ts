// Un passage de la banque simulée : `npm run simulate:payments`. Crée les mensualités manquantes
// jusqu'au mois en cours et encaisse celles dont le jour est venu (horloge APP_NOW si définie).
// Volontairement manuel : une tâche planifiée sur l'heure réelle écrirait dans la base des tests
// e2e, dont l'horloge est figée.
import { now } from "../src/common/clock.js";
import { simulateBank } from "../src/finance/monthly-payments.js";
import { prisma } from "../src/prisma/client.js";

async function main() {
  const at = now();
  const { created, settled } = await simulateBank(prisma, at);
  console.log(
    `Banque simulée au ${at.toISOString().slice(0, 10)} : ` +
      `${created} mensualité${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}, ` +
      `${settled} encaissée${settled > 1 ? "s" : ""}.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
