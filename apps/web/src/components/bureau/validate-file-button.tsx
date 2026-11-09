"use client";

import { bureauChildSchema } from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api-client";

/** « Valider le dossier » : le relais en est prévenu par e-mail. */
export function ValidateFileButton({
  childId,
  relaisName,
}: {
  childId: string;
  relaisName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
      className="self-start"
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch(
            `/api/bureau/children/${encodeURIComponent(childId)}/validate`,
            bureauChildSchema,
            { method: "POST" },
          );
          toast(`Dossier validé : ${relaisName} est prévenu`);
          router.refresh();
        } catch (caught) {
          toast(
            caught instanceof ApiRequestError
              ? caught.message
              : "Le service est momentanément indisponible. Réessayez dans un instant.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      Valider le dossier
    </Button>
  );
}
