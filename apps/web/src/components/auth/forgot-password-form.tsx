"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, authMessages, emailError } from "@/lib/auth-errors";
import { LOGIN_PATH } from "@/lib/auth-paths";
import { FormAlert } from "./form-alert";
import { authLinkClass } from "./link-button";
import { NoBreak } from "./no-break";

/** Page du lien reçu par e-mail (l'API y ajoute `?token=` ou `?error=INVALID_TOKEN`). */
export const RESET_PASSWORD_PATH = "/reinitialiser-mot-de-passe";

const headingClass = "m-0 text-28 font-extrabold outline-none";

/**
 * Demande de réinitialisation. La confirmation est la même que l'adresse corresponde ou non à
 * un compte : la page ne révèle pas qui est inscrit.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = emailError(email);
    setFieldError(invalid);
    if (invalid) {
      emailRef.current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    let message: string | null = null;
    try {
      const { error: failure } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: RESET_PASSWORD_PATH,
      });
      message = failure ? authErrorMessage(failure) : null;
    } catch {
      message = authMessages.network;
    }
    setPending(false);
    if (message) {
      setError(message);
      emailRef.current?.focus();
      return;
    }
    flushSync(() => setSentTo(email.trim()));
    headingRef.current?.focus();
  }

  if (sentTo !== null) {
    return (
      <div className="flex flex-col gap-4.5">
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
          Vérifiez votre boîte <NoBreak>e-mail</NoBreak>
        </h2>
        <p className="m-0 text-16 leading-[1.5]">
          Si un compte correspond à <strong>{sentTo}</strong>, un e-mail vient de lui être envoyé
          avec un lien pour choisir un nouveau mot de passe.
        </p>
        <p className="m-0 text-15 leading-[1.5] text-muted">
          Le lien est valable 1 heure. Rien reçu ? Vérifiez l&apos;adresse saisie et vos courriers
          indésirables.
        </p>
        <p className="m-0 border-t border-line pt-4.5 text-14">
          <Link href={LOGIN_PATH} className={authLinkClass}>
            Retour à la connexion
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-4.5">
      <h2 className={headingClass}>Mot de passe oublié</h2>
      <p className="m-0 text-15 leading-[1.5] text-muted">
        Saisissez l&apos;adresse e-mail de votre compte : vous recevrez un lien pour choisir un
        nouveau mot de passe.
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <FormField label="Adresse e-mail" error={fieldError}>
        <Input
          ref={emailRef}
          type="email"
          name="email"
          size="lg"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </FormField>
      <Button type="submit" size="2xl" fullWidth loading={pending}>
        Recevoir le lien
      </Button>
      <p className="m-0 border-t border-line pt-4.5 text-14">
        <Link href={LOGIN_PATH} className={authLinkClass}>
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
