"use client";

import { useState } from "react";
import { Button, Dialog, FormField, Input, Toaster, toast } from "@/components/ui";

/** Démonstration des composants qui ont besoin d'un état client (dialogue, toast). */
export function InteractiveDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Modifier ma mensualité
      </Button>
      <Button variant="soft-brand" onClick={() => toast("Publication enregistrée")}>
        Afficher un toast
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Modifier ma mensualité"
        description="Le nouveau montant s'applique au prochain prélèvement."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                toast("Mensualité mise à jour");
              }}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <FormField label="Montant mensuel (€)">
          <Input type="number" min={10} max={500} defaultValue={25} />
        </FormField>
      </Dialog>
      <Toaster />
    </div>
  );
}
