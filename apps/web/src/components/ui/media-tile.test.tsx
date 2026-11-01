import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MediaTile } from "./media-tile";

afterEach(cleanup);

describe("MediaTile", () => {
  it("affiche une photo servie par l'API, chargée à la demande", () => {
    render(<MediaTile kind="photo" label="Photo de la classe" src="/api/media/m1" />);
    const image = screen.getByRole("img", { name: "Photo de la classe" });
    expect(image.getAttribute("src")).toBe("/api/media/m1");
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  it("garde l'emplacement réservé légendé d'une photo sans fichier", () => {
    const { container } = render(<MediaTile kind="photo" label="Photo de la classe" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.textContent).toBe("Photo de la classe");
    expect(container.firstElementChild?.className).toContain("h-[150px]");
  });

  it("affiche la durée d'une vidéo sans fichier, sur 220 px en grand format", () => {
    const { container } = render(
      <MediaTile kind="video" label="Nouvelle de rentrée" duration="0:42" size="lg" />,
    );
    expect(container.textContent).toBe("Vidéo · 0:42");
    expect(container.firstElementChild?.className).toContain("h-[220px]");
    expect(container.querySelector("video")).toBeNull();
  });

  it("lit une vidéo prête avec ses contrôles", () => {
    const { container } = render(
      <MediaTile kind="video" label="Nouvelle de rentrée" src="/api/media/v1" />,
    );
    const video = container.querySelector("video");
    expect(video?.getAttribute("src")).toBe("/api/media/v1");
    expect(video?.hasAttribute("controls")).toBe(true);
    expect(video?.getAttribute("aria-label")).toBe("Nouvelle de rentrée");
  });

  it("propose le téléchargement d'un document prêt", () => {
    render(
      <MediaTile kind="document" label="Bulletin T1 — 2026-27" href="/api/media/b1?download=1" />,
    );
    // jsdom colle « (télécharger) » au libellé ; Chrome garde l'espace (e2e/parrain.spec.ts).
    const link = screen.getByRole("link", { name: /^Bulletin T1 — 2026-27\s?\(télécharger\)$/ });
    expect(link.getAttribute("href")).toBe("/api/media/b1?download=1");
  });

  it("n'est pas cliquable pour un document sans fichier", () => {
    render(<MediaTile kind="document" label="Bulletin annuel — 2025-26" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Bulletin annuel — 2025-26")).toBeTruthy();
  });
});
