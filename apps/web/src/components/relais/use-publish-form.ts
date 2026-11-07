"use client";

import {
  createdNewsSchema,
  createNewsSchema,
  NEWS_MAX_MEDIA,
  type NewsPostType,
  type RelaisChildRow,
  type UploadedMedia,
  type UploadKind,
} from "@parrainage/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "@/components/ui";
import {
  ApiRequestError,
  apiFetch,
  NETWORK_ERROR_MESSAGE,
  newIdempotencyKey,
} from "@/lib/api-client";
import type { OutboxFile } from "@/lib/outbox/core";
import { type PreparedFile, prepareFile, UploadError, uploadFile } from "@/lib/upload";
import { useOutbox } from "./outbox-provider";

export type PublishMedia = {
  localId: string;
  kind: UploadKind;
  /** Aperçu local (photo) ; une vidéo montre seulement sa tuile. */
  previewUrl: string | null;
  uploading: boolean;
  /** Déposé et vérifié par l'API. */
  uploaded: UploadedMedia | null;
  /** Gardé sur le poste, à déposer quand le réseau reviendra. */
  file: PreparedFile | null;
};

const errorMessage = (caught: unknown) =>
  caught instanceof ApiRequestError ? caught.message : NETWORK_ERROR_MESSAGE;

const GENERIC_UPLOAD_ERROR = "L'envoi du fichier a échoué. Réessayez dans un instant.";

/** « d'Aïcha », « de Kofi ». */
const ofFirstName = (name: string) =>
  /^[aeiouhàâäéèêëîïôöûü]/i.test(name) ? `d'${name}` : `de ${name}`;

/** Titre d'une publication depuis le téléphone, qui n'en demande pas (RM-Publier). */
export function defaultNewsTitle(type: NewsPostType, selected: readonly RelaisChildRow[]): string {
  if (type === "RELAIS_LIFE") {
    return "Vie du relais";
  }
  const [first] = selected;
  return selected.length === 1 && first
    ? `Nouvelles ${ofFirstName(first.name.split(" ")[0] ?? first.name)}`
    : "Nouvelles du relais";
}

export type PublishFormProps = {
  /** Enfants suivis du relais (dossier envoyé ou validé). */
  followed: readonly RelaisChildRow[];
  initialChildId: string | null;
};

/**
 * Tout l'état de la publication, porté par le parent : les variantes web et mobile sont purement
 * visuelles, aucun envoi n'est monté deux fois. Un fichier se dépose dès qu'il est choisi si le
 * réseau est là ; sinon il attend sur le poste, avec la publication.
 */
export function usePublishForm({ followed, initialChildId }: PublishFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { online, enqueueNews } = useOutbox();
  const keyRef = useRef<string | null>(null);
  const nextLocalId = useRef(0);
  const previews = useRef(new Set<string>());

  const initial = followed.find((child) => child.id === initialChildId);
  const [type, setType] = useState<NewsPostType>(initial ? "ONE_CHILD" : "SEVERAL_CHILDREN");
  const [childIds, setChildIds] = useState<readonly string[]>(initial ? [initial.id] : []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<readonly PublishMedia[]>([]);
  const [notifyParrains, setNotifyParrains] = useState(true);
  const [notifyBureau, setNotifyBureau] = useState(true);
  const [visibleToChildren, setVisibleToChildren] = useState(false);
  const [sending, setSending] = useState<"now" | "later" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, readonly string[]>>>({});
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Page servie hors ligne : la copie gardée ignore `?enfant=`, on le relit dans l'adresse. Une seule
  // fois, au chargement de la page, et juste après le rendu initial pour ne pas le contredire.
  useEffect(() => {
    if (initialChildId !== null) {
      return;
    }
    const fromUrl = new URLSearchParams(window.location.search).get("enfant");
    if (!fromUrl || !followed.some((child) => child.id === fromUrl)) {
      return;
    }
    const timer = setTimeout(() => {
      setType("ONE_CHILD");
      setChildIds([fromUrl]);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const urls = previews.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const selected = useMemo(
    () =>
      type === "RELAIS_LIFE" ? followed : followed.filter((child) => childIds.includes(child.id)),
    [followed, childIds, type],
  );
  const parrainCount = new Set(selected.flatMap((child) => child.parrainIds)).size;
  const withoutConsent = selected.filter((child) => !child.consentMedia);
  const uploading = media.some((item) => item.uploading);

  function changeType(next: NewsPostType) {
    setType(next);
    if (next === "ONE_CHILD") {
      setChildIds((ids) => ids.slice(0, 1));
    }
  }

  /** Choix depuis le téléphone : un enfant, ou plusieurs selon le nombre retenu. */
  function chooseChildren(ids: readonly string[]) {
    setChildIds(ids);
    setType(ids.length > 1 ? "SEVERAL_CHILDREN" : "ONE_CHILD");
  }

  const patchMedia = useCallback((localId: string, patch: Partial<PublishMedia>) => {
    setMedia((list) =>
      list.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  }, []);

  async function addOne(file: File) {
    let prepared: PreparedFile;
    try {
      prepared = await prepareFile(file);
    } catch (caught) {
      setUploadError(caught instanceof UploadError ? caught.message : GENERIC_UPLOAD_ERROR);
      return;
    }
    const localId = `local-${(nextLocalId.current += 1)}`;
    const previewUrl = prepared.kind === "PHOTO" ? URL.createObjectURL(prepared.blob) : null;
    if (previewUrl) {
      previews.current.add(previewUrl);
    }
    setMedia((list) => [
      ...list,
      {
        localId,
        kind: prepared.kind,
        previewUrl,
        uploading: online,
        uploaded: null,
        file: prepared,
      },
    ]);
    if (!online) {
      return;
    }
    try {
      const uploaded = await uploadFile(prepared, { purpose: "news" });
      patchMedia(localId, { uploading: false, uploaded, file: null });
    } catch (caught) {
      if (caught instanceof UploadError && caught.resumable) {
        // Le réseau a lâché : le fichier attend sur le poste.
        patchMedia(localId, { uploading: false });
        return;
      }
      setMedia((list) => list.filter((item) => item.localId !== localId));
      setUploadError(caught instanceof UploadError ? caught.message : GENERIC_UPLOAD_ERROR);
    }
  }

  async function addFiles(files: FileList | readonly File[]) {
    setUploadError(null);
    const room = NEWS_MAX_MEDIA - media.length;
    await Promise.all([...files].slice(0, room).map((file) => addOne(file)));
  }

  function removeMedia(localId: string) {
    setMedia((list) => {
      const removed = list.find((item) => item.localId === localId);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previews.current.delete(removed.previewUrl);
      }
      return list.filter((item) => item.localId !== localId);
    });
  }

  function reset() {
    setTitle("");
    setBody("");
    setMedia([]);
    setChildIds([]);
  }

  /** Met la publication en file : elle partira d'elle-même, une seule fois (clé d'idempotence). */
  async function queue(payload: ReturnType<typeof createNewsSchema.parse>) {
    const files: OutboxFile[] = media.flatMap((item) =>
      item.file
        ? [
            {
              id: item.localId,
              blob: item.file.blob,
              kind: item.file.kind,
              mimeType: item.file.mimeType,
              fileName: item.file.fileName,
              fingerprint: item.file.fingerprint,
              mediaId: null,
            },
          ]
        : [],
    );
    await enqueueNews({ parrainCount, payload, files });
    keyRef.current = null;
    toast(
      online
        ? "Publication en cours d'envoi"
        : "Publication gardée sur ce poste : elle partira au retour du réseau",
    );
    reset();
    setSending(null);
    startTransition(() => router.push("/relais"));
  }

  /**
   * `autoTitle` : depuis le téléphone, le titre se déduit des enfants choisis. `onDone` : la
   * publication est partie ou gardée (le dialogue de programmation se ferme alors).
   */
  async function publish(
    scheduledAt: string | null,
    { autoTitle = false, onDone }: { autoTitle?: boolean; onDone?: () => void } = {},
  ) {
    setSending(scheduledAt ? "later" : "now");
    setError(null);
    setFieldErrors({});
    // Gardée d'un essai à l'autre : un nouvel essai ne publie pas deux fois.
    keyRef.current ??= newIdempotencyKey();
    const parsed = createNewsSchema.safeParse({
      // Le téléphone choisit d'abord un enfant : sans choix, on lui en demande un.
      type: autoTitle && type === "SEVERAL_CHILDREN" && childIds.length < 2 ? "ONE_CHILD" : type,
      childIds: type === "RELAIS_LIFE" ? [] : childIds,
      title: title.trim() || (autoTitle ? defaultNewsTitle(type, selected) : ""),
      body,
      mediaIds: media.flatMap((item) => (item.uploaded ? [item.uploaded.id] : [])),
      notifyParrains,
      notifyBureau,
      visibleToChildren,
      scheduledAt,
      idempotencyKey: keyRef.current,
    });
    if (!parsed.success) {
      const issues: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        (issues[field] ??= []).push(issue.message);
      }
      setFieldErrors(issues);
      setError("Vérifiez les champs signalés");
      setSending(null);
      return;
    }
    const waitingFiles = media.some((item) => item.file !== null);
    if (!online || waitingFiles) {
      await queue(parsed.data);
      onDone?.();
      return;
    }
    try {
      const { data } = await apiFetch("/api/relais/news", createdNewsSchema, {
        method: "POST",
        body: parsed.data,
      });
      keyRef.current = null;
      onDone?.();
      toast(data.status === "SCHEDULED" ? "Nouvelle programmée" : "Nouvelle publiée");
      if (data.status === "SCHEDULED") {
        reset();
        setSending(null);
      }
      startTransition(() => {
        router.push(data.status === "SCHEDULED" ? "/relais/publier" : "/relais");
        router.refresh();
      });
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 0) {
        await queue(parsed.data);
        onDone?.();
        return;
      }
      setError(errorMessage(caught));
      if (caught instanceof ApiRequestError) {
        setFieldErrors(caught.fieldErrors);
      }
      setSending(null);
    }
  }

  return {
    online,
    type,
    changeType,
    childIds,
    setChildIds,
    chooseChildren,
    selected,
    parrainCount,
    withoutConsent,
    title,
    setTitle,
    body,
    setBody,
    media,
    addFiles,
    removeMedia,
    uploading,
    uploadError,
    notifyParrains,
    setNotifyParrains,
    notifyBureau,
    setNotifyBureau,
    visibleToChildren,
    setVisibleToChildren,
    sending,
    error,
    fieldErrors,
    errorsOf: (field: string) => fieldErrors[field]?.join(" "),
    publish,
  };
}

export type PublishFormState = ReturnType<typeof usePublishForm>;
