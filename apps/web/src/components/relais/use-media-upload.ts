"use client";

import type { UploadedMedia, UploadPurpose } from "@parrainage/contracts";
import { useCallback, useState } from "react";
import { prepareFile, UploadError, uploadFile } from "@/lib/upload";

const GENERIC_ERROR = "L'envoi du fichier a échoué. Réessayez dans un instant.";

/** Envoie un fichier de l'espace relais : préparation, dépôt, vérification, erreur à afficher. */
export function useMediaUpload(
  purpose: UploadPurpose,
  limits?: { maxWidthOrHeight: number; maxSizeMB: number },
) {
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File): Promise<UploadedMedia | null> => {
      setUploading((count) => count + 1);
      setError(null);
      try {
        const prepared = await prepareFile(file, { limits });
        return await uploadFile(prepared, { purpose });
      } catch (caught) {
        setError(caught instanceof UploadError ? caught.message : GENERIC_ERROR);
        return null;
      } finally {
        setUploading((count) => count - 1);
      }
    },
    [purpose, limits],
  );

  return { upload, uploading: uploading > 0, error, clearError: () => setError(null) };
}
