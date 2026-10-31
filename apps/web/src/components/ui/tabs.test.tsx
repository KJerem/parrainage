import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tab, TabList, TabPanel, Tabs } from "./tabs";

afterEach(cleanup);

function SendTabs({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <Tabs defaultValue="bulletin" variant="kid" onValueChange={onValueChange}>
      <TabList aria-label="Que veux-tu envoyer ?">
        <Tab value="photo">Une photo</Tab>
        <Tab value="video">Une vidéo</Tab>
        <Tab value="bulletin">Mon bulletin</Tab>
      </TabList>
      <TabPanel value="photo">Panneau photo</TabPanel>
      <TabPanel value="video">Panneau vidéo</TabPanel>
      <TabPanel value="bulletin">Panneau bulletin</TabPanel>
    </Tabs>
  );
}

function tab(name: string) {
  return screen.getByRole("tab", { name });
}

describe("Tabs", () => {
  it("relie onglets et panneaux", () => {
    render(<SendTabs />);
    expect(screen.getByRole("tablist", { name: "Que veux-tu envoyer ?" })).toBeTruthy();
    const active = tab("Mon bulletin");
    expect(active.getAttribute("aria-selected")).toBe("true");
    expect(active.tabIndex).toBe(0);
    expect(tab("Une photo").tabIndex).toBe(-1);

    const panel = screen.getByRole("tabpanel");
    expect(panel.textContent).toBe("Panneau bulletin");
    expect(panel.getAttribute("aria-labelledby")).toBe(active.id);
    expect(active.getAttribute("aria-controls")).toBe(panel.id);
    expect(screen.getByText("Panneau photo").hidden).toBe(true);
  });

  it("change d'onglet avec les flèches, Début et Fin", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SendTabs onValueChange={onValueChange} />);

    await user.tab();
    expect(document.activeElement).toBe(tab("Mon bulletin"));

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(tab("Une photo"));
    expect(tab("Une photo").getAttribute("aria-selected")).toBe("true");
    expect(tab("Mon bulletin").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel").textContent).toBe("Panneau photo");
    expect(onValueChange).toHaveBeenLastCalledWith("photo");

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(tab("Mon bulletin"));

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(tab("Une photo"));

    await user.keyboard("{End}");
    expect(document.activeElement).toBe(tab("Mon bulletin"));
    expect(screen.getByRole("tabpanel").textContent).toBe("Panneau bulletin");
  });

  it("applique le style enfant à l'onglet actif", () => {
    render(<SendTabs />);
    expect(tab("Mon bulletin").className).toContain("bg-brand-700");
    expect(tab("Une photo").className).toContain("border-kid-line");
  });

  it("n'annonce pas de panneau absent", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="parrains">
        <TabList aria-label="Filtrer">
          <Tab value="parrains">Parrains</Tab>
          <Tab value="bureau">Bureau</Tab>
        </TabList>
      </Tabs>,
    );
    expect(tab("Parrains").getAttribute("aria-controls")).toBeNull();
    expect(tab("Parrains").className).toContain("bg-brand-100");
    await user.click(tab("Bureau"));
    expect(tab("Bureau").getAttribute("aria-selected")).toBe("true");
  });
});
