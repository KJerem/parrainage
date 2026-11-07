"use client";

import { type FormEvent, type ReactNode, useRef } from "react";
import { pendingBeforeSignOut, purgeOfflineData } from "@/lib/offline-purge";

/**
 * Déconnexion : un formulaire POST, qui marche sans JavaScript (le serveur demande alors au
 * navigateur d'effacer ses données). Avec JavaScript, tout est effacé avant de partir, et les
 * saisies en attente ne se perdent pas sans avertissement.
 */
export function SignOutForm({
  action,
  children,
  className,
}: {
  action: string;
  children: ReactNode;
  className?: string;
}) {
  const submitting = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitting.current) {
      return;
    }
    event.preventDefault();
    const form = event.currentTarget;
    const pending = await pendingBeforeSignOut();
    if (
      pending > 0 &&
      !window.confirm(
        `${pending} ${pending > 1 ? "envois en attente seront perdus" : "envoi en attente sera perdu"} si vous vous déconnectez maintenant. Se déconnecter quand même ?`,
      )
    ) {
      return;
    }
    await purgeOfflineData();
    submitting.current = true;
    form.submit();
  }

  return (
    <form method="post" action={action} className={className} onSubmit={(e) => void onSubmit(e)}>
      {children}
    </form>
  );
}
