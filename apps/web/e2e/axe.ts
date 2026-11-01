import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const blockingImpacts = ["serious", "critical"];

/** Analyse axe de la page courante : aucune violation sérieuse ni critique. */
export async function expectNoBlockingViolations(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
  const blocking = violations
    .filter((violation) => blockingImpacts.includes(violation.impact ?? ""))
    .map(
      (violation) =>
        `[${violation.impact}] ${violation.id} : ${violation.help}\n  ${violation.nodes
          .map((node) => node.target.join(" "))
          .join("\n  ")}`,
    );
  expect(blocking, blocking.join("\n")).toEqual([]);
}
