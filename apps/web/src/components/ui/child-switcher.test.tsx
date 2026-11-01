import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChildSwitcher } from "./child-switcher";

afterEach(cleanup);

const items = [
  { id: "aicha", label: "Aïcha", initials: "AS", tone: "amber", href: "/parrain?filleul=aicha" },
  { id: "kofi", label: "Kofi", initials: "KA", tone: "brand", href: "/parrain?filleul=kofi" },
] as const;

describe("ChildSwitcher", () => {
  it("rend une navigation de liens vers chaque filleul", () => {
    render(<ChildSwitcher items={items} currentId="aicha" />);
    const nav = screen.getByRole("navigation", { name: "Choisir un filleul" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/parrain?filleul=aicha",
      "/parrain?filleul=kofi",
    ]);
    // Les initiales de l'avatar sont décoratives : le nom accessible est le prénom.
    expect(screen.getByRole("link", { name: "Aïcha" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kofi" })).toBeTruthy();
  });

  it("marque le filleul affiché avec aria-current et le fond brand-700", () => {
    render(<ChildSwitcher items={items} currentId="kofi" />);
    const kofi = screen.getByRole("link", { name: "Kofi" });
    const aicha = screen.getByRole("link", { name: "Aïcha" });
    expect(kofi.getAttribute("aria-current")).toBe("page");
    expect(kofi.className).toContain("bg-brand-700");
    expect(aicha.getAttribute("aria-current")).toBeNull();
    expect(aicha.className).not.toContain("bg-brand-700");
  });

  it("défile horizontalement sous sm", () => {
    render(<ChildSwitcher items={items} currentId="aicha" aria-label="Filleul affiché" />);
    const nav = screen.getByRole("navigation", { name: "Filleul affiché" });
    expect(nav.className).toContain("max-sm:overflow-x-auto");
  });
});
