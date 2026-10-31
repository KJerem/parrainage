import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { FilterPills } from "./filter-pills";

afterEach(cleanup);

function ConfirmDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Approuver</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Approuver le message"
        description="Le message sera remis à Kofi A."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => setOpen(false)}>Confirmer</Button>
          </>
        }
      />
    </>
  );
}

describe("Dialog", () => {
  it("s'ouvre, se nomme par son titre et se ferme avec Échap", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    const trigger = screen.getByRole("button", { name: "Approuver" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Approuver le message" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-describedby")).toBe(
      screen.getByText("Le message sera remis à Kofi A.").id,
    );

    screen.getByRole("button", { name: "Confirmer" }).focus();
    await user.keyboard("{Escape}");
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("garde le focus à l'intérieur avec Tab et Maj+Tab", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    await user.click(screen.getByRole("button", { name: "Approuver" }));

    const close = screen.getByRole("button", { name: "Fermer" });
    const confirm = screen.getByRole("button", { name: "Confirmer" });
    confirm.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("se ferme avec le bouton Fermer", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog />);
    await user.click(screen.getByRole("button", { name: "Approuver" }));
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("FilterPills", () => {
  it("indique le filtre actif avec aria-pressed", async () => {
    const user = userEvent.setup();
    render(
      <FilterPills
        aria-label="Filtrer la file"
        options={[
          { value: "all", label: "Tous" },
          { value: "reported", label: "Signalés" },
        ]}
      />,
    );
    const all = screen.getByRole("button", { name: "Tous" });
    const reported = screen.getByRole("button", { name: "Signalés" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(all.className).toContain("bg-ink");
    await user.click(reported);
    expect(reported.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
  });
});
