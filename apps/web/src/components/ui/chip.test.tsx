import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chip, CountBadge, StatusBadge } from "./chip";

afterEach(cleanup);

describe("Chip", () => {
  it.each([
    ["success", "bg-brand-100", "text-brand-700"],
    ["warning", "bg-accent-100", "text-accent-700"],
    ["danger", "bg-danger-100", "text-danger-600"],
    ["info", "bg-info-100", "text-info-600"],
    ["neutral", "bg-canvas", "text-ink-soft"],
    ["solid-brand", "bg-brand-700", "text-white"],
    ["danger-on-white", "bg-white", "text-danger-600"],
    ["solid-danger", "bg-danger-600", "text-white"],
  ] as const)("applique la variante %s", (variant, background, color) => {
    render(<Chip variant={variant}>Statut</Chip>);
    const chip = screen.getByText("Statut");
    expect(chip.className).toContain(background);
    expect(chip.className).toContain(color);
  });

  it.each([
    ["sm", "text-12", "rounded-12"],
    ["md", "text-13", "rounded-20"],
    ["kid", "text-16", "rounded-10"],
  ] as const)("applique la taille %s", (size, text, radius) => {
    render(<Chip size={size}>Envoyé</Chip>);
    const chip = screen.getByText("Envoyé");
    expect(chip.className).toContain(text);
    expect(chip.className).toContain(radius);
  });

  it("StatusBadge reprend le rendu de Chip", () => {
    render(<StatusBadge variant="danger">À relancer</StatusBadge>);
    expect(screen.getByText("À relancer").className).toContain("bg-danger-100");
  });

  it("laisse une classe de l'appelant remplacer la taille de texte", () => {
    render(
      <Chip variant="danger" className="text-13">
        Alerte
      </Chip>,
    );
    const classes = screen.getByText("Alerte").className;
    expect(classes).toContain("text-13");
    expect(classes).not.toContain("text-12");
    expect(classes).toContain("text-danger-600");
  });
});

describe("CountBadge", () => {
  it("affiche le nombre et un libellé pour les lecteurs d'écran", () => {
    render(<CountBadge count={2} srLabel="messages non lus" />);
    expect(screen.getByText("2 messages non lus").className).toContain("sr-only");
    expect(screen.getByText("2").getAttribute("aria-hidden")).toBe("true");
  });

  it("plafonne l'affichage", () => {
    render(<CountBadge count={150} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });
});
