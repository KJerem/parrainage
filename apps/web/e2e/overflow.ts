import { expect, type Page } from "@playwright/test";

/** Largeurs du test « pas de débordement horizontal » (plan, section 6). */
export const overflowWidths = [360, 390, 430, 768, 952, 1024, 1180, 1280, 1440];

type Overflow = { viewportWidth: number; scrollWidth: number; offenders: string[] };

// Mesure le débordement et liste les éléments qui dépassent à droite, hors zones
// défilantes ou rognées (enveloppes de tableau, pastilles de navigation…).
function measureOverflow(): Overflow {
  const viewportWidth = window.innerWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth <= viewportWidth) return { viewportWidth, scrollWidth, offenders: [] };

  const contained = (element: Element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const overflowX = getComputedStyle(parent).overflowX;
      if (["auto", "scroll", "hidden", "clip"].includes(overflowX)) return true;
    }
    return false;
  };
  const overflows = (element: Element) =>
    element.getBoundingClientRect().right > viewportWidth && !contained(element);
  const label = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const id = element.id ? `#${element.id}` : "";
    const classes = [...element.classList]
      .slice(0, 6)
      .map((name) => `.${name}`)
      .join("");
    return `<${element.tagName.toLowerCase()}${id}${classes}> droite ${Math.round(rect.right)} px, largeur ${Math.round(rect.width)} px`;
  };

  const all = [...document.querySelectorAll("body, body *")].filter(overflows);
  // L'origine du débordement : un élément qui dépasse alors que son parent tient dans l'écran.
  const origins = all.filter(
    (element) => !element.parentElement || !overflows(element.parentElement),
  );
  const offenders = (origins.length > 0 ? origins : all).slice(0, 15).map(label);
  return { viewportWidth, scrollWidth, offenders };
}

/** Ouvre `path` à la largeur donnée et vérifie que la page ne défile pas horizontalement. */
export async function expectNoOverflowAt(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const response = await page.goto(path);
  expect(response?.status(), `${path} doit répondre 200`).toBe(200);
  await page.evaluate(() => document.fonts.ready);

  const { viewportWidth, scrollWidth, offenders } = await page.evaluate(measureOverflow);
  expect(
    scrollWidth,
    `${path} déborde de ${scrollWidth - viewportWidth} px à ${width} px :\n${offenders.join("\n")}`,
  ).toBeLessThanOrEqual(viewportWidth);
}
