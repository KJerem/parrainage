import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";
import { MessageIcon } from "./icons";

afterEach(cleanup);

describe("Button", () => {
  it("rend un bouton primaire de type button par défaut", () => {
    render(<Button>Envoyer</Button>);
    const button = screen.getByRole("button", { name: "Envoyer" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("bg-brand-700");
    expect(button.className).toContain("min-h-11");
  });

  it.each([
    ["accent", "bg-accent-500"],
    ["secondary", "border-line-strong"],
    ["soft-accent", "bg-accent-100"],
    ["soft-brand", "bg-brand-100"],
    ["outline-on-dark", "border-brand-400"],
    ["kid-outline", "border-ink"],
    ["kid-accent", "font-extrabold"],
  ] as const)("applique la variante %s", (variant, expected) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole("button").className).toContain(expected);
  });

  it("donne aux variantes enfant leur taille propre", () => {
    render(
      <>
        <Button variant="kid-outline">J&apos;ai fini</Button>
        <Button variant="kid-primary">Envoyer</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "J'ai fini" }).className).toContain("min-h-12");
    expect(screen.getByRole("button", { name: "Envoyer" }).className).toContain("min-h-14");
  });

  it("agrandit les petites tailles sur écran tactile", () => {
    render(<Button size="sm">Retenir</Button>);
    const classes = screen.getByRole("button").className;
    expect(classes).toContain("min-h-9");
    expect(classes).toContain("pointer-coarse:min-h-11");
  });

  it("devient un lien quand href est fourni", () => {
    render(
      <Button href="/parrain/messages" variant="secondary" leftIcon={<MessageIcon size={18} />}>
        Répondre
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Répondre" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/parrain/messages");
    expect(link.className).toContain("no-underline");
    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("signale le chargement et bloque le bouton", () => {
    render(
      <Button loading type="submit">
        Envoyer
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Envoyer" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("ne remplace pas l'icône hors chargement", () => {
    render(<Button leftIcon={<MessageIcon data-testid="icone" />}>Écrire</Button>);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(screen.getByTestId("icone")).toBeTruthy();
  });

  it("rend un bouton carré pour une icône seule", () => {
    render(
      <Button iconOnly variant="ghost" size="lg" aria-label="Notifications">
        <MessageIcon />
      </Button>,
    );
    const classes = screen.getByRole("button", { name: "Notifications" }).className;
    expect(classes).toContain("size-11");
    expect(classes).toContain("rounded-12");
    expect(classes).not.toContain("rounded-10");
  });

  it("prend toute la largeur avec fullWidth", () => {
    render(<Button fullWidth>Ajouter à mon agenda</Button>);
    expect(screen.getByRole("button").className).toContain("w-full");
  });
});
