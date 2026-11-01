"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, authMessages, newPasswordError } from "@/lib/auth-errors";
import { LOGIN_PATH } from "@/lib/auth-paths";
import { FormAlert } from "./form-alert";
import { authLinkClass } from "./link-button";

type FieldErrors = { password?: string; confirmation?: string };

const headingClass = "m-0 text-28 font-extrabold outline-none";

export type ResetPasswordFormProps = {
  /** Jeton du lien reçu par e-mail (vérifié par l'API à l'envoi). */
  token: string;
};

/** Choix du nouveau mot de passe ; l'API révoque ensuite toutes les sessions du compte. */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: FieldErrors = {
      password: newPasswordError(password),
      confirmation:
        confirmation === password || newPasswordError(password)
          ? undefined
          : authMessages.passwordMismatch,
    };
    setFieldErrors(errors);
    if (errors.password || errors.confirmation) {
      (errors.password ? passwordRef : confirmationRef).current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error: failure } = await authClient.resetPassword({ newPassword: password, token });
      if (failure) {
        setPending(false);
        setLinkExpired(failure.code === "INVALID_TOKEN");
        setError(authErrorMessage(failure));
        passwordRef.current?.focus();
        return;
      }
    } catch {
      setPending(false);
      setError(authMessages.network);
      return;
    }
    flushSync(() => {
      setPending(false);
      setDone(true);
    });
    headingRef.current?.focus();
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4.5">
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
          Mot de passe modifié
        </h2>
        <p className="m-0 text-16 leading-[1.5]">
          Votre nouveau mot de passe est enregistré. Par sécurité, toutes vos sessions ouvertes ont
          été fermées.
        </p>
        <Button href={LOGIN_PATH} size="2xl" fullWidth>
          Se connecter
        </Button>
      </div>
    );
  }

  return (
    <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-4.5">
      <h2 className={headingClass}>Nouveau mot de passe</h2>
      <p className="m-0 text-15 leading-[1.5] text-muted">
        Choisissez un mot de passe d&apos;au moins 8 caractères.
      </p>
      {error ? (
        <FormAlert>
          {error}
          {linkExpired ? (
            <>
              {" "}
              <Link href="/mot-de-passe-oublie" className="text-danger-600 underline">
                Demander un nouveau lien
              </Link>
            </>
          ) : null}
        </FormAlert>
      ) : null}
      <FormField
        label="Nouveau mot de passe"
        hint="8 caractères minimum."
        error={fieldErrors.password}
      >
        <Input
          ref={passwordRef}
          type="password"
          name="new-password"
          size="lg"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </FormField>
      <FormField label="Confirmer le mot de passe" error={fieldErrors.confirmation}>
        <Input
          ref={confirmationRef}
          type="password"
          name="confirmation"
          size="lg"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </FormField>
      <Button type="submit" size="2xl" fullWidth loading={pending}>
        Enregistrer le mot de passe
      </Button>
      <p className="m-0 border-t border-line pt-4.5 text-14">
        <Link href={LOGIN_PATH} className={authLinkClass}>
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
