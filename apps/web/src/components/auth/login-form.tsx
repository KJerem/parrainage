"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormField, Input } from "@/components/ui/form-field";
import { authClient } from "@/lib/auth-client";
import { forgetOfflinePages } from "@/lib/offline-purge";
import {
  authErrorMessage,
  authMessages,
  emailError,
  type AuthClientError,
} from "@/lib/auth-errors";
import { loginPath } from "@/lib/auth-paths";
import { FormAlert } from "./form-alert";
import { authLinkClass, LinkButton } from "./link-button";
import { NoBreak } from "./no-break";

type Mode = "password" | "magic" | "sent";

type FieldErrors = { email?: string; password?: string };

export type LoginFormProps = {
  /** Destination après connexion (chemin déjà vérifié), sinon l'accueil qui oriente selon le rôle. */
  next: string | null;
  subtitle: string;
  /** Erreur d'un lien magique (`?error=` posé par l'API) : ouvre directement le formulaire du lien. */
  linkError?: string;
};

const headingClass = "m-0 text-28 font-extrabold outline-none";

/**
 * Connexion (P-Connexion) : e-mail et mot de passe, ou lien de connexion reçu par e-mail.
 * Les appels passent par le client Better Auth, dans le navigateur, pour que le cookie de
 * session soit posé sur l'origine du web.
 */
export function LoginForm({ next, subtitle, linkError }: LoginFormProps) {
  // Arriver ici, c'est ne plus être connecté : les pages gardées hors ligne s'en vont.
  useEffect(() => {
    void forgetOfflinePages();
  }, []);

  const router = useRouter();
  const [mode, setMode] = useState<Mode>(linkError ? "magic" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(linkError ?? null);
  const [pending, setPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Le titre du nouveau mode reçoit le focus : les lecteurs d'écran annoncent le changement.
  function switchMode(target: Mode) {
    flushSync(() => {
      setMode(target);
      setError(null);
      setFieldErrors({});
    });
    headingRef.current?.focus();
  }

  function fail(failure: AuthClientError | "network", focus: HTMLInputElement | null) {
    setPending(false);
    setError(failure === "network" ? authMessages.network : authErrorMessage(failure));
    focus?.focus();
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: FieldErrors = {
      email: emailError(email),
      password: password === "" ? authMessages.missingPassword : undefined,
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error: failure } = await authClient.signIn.email({ email: email.trim(), password });
      if (failure) {
        fail(failure, passwordRef.current);
        return;
      }
    } catch {
      fail("network", passwordRef.current);
      return;
    }
    // Le bouton reste en attente pendant la navigation.
    router.replace(next ?? "/");
    router.refresh();
  }

  async function submitMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: FieldErrors = { email: emailError(email) };
    setFieldErrors(errors);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error: failure } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: next ?? "/",
        // Lien expiré ou déjà utilisé : retour ici avec `?error=INVALID_TOKEN`.
        errorCallbackURL: loginPath(next),
      });
      if (failure) {
        fail(failure, emailRef.current);
        return;
      }
    } catch {
      fail("network", emailRef.current);
      return;
    }
    setPending(false);
    setSentTo(email.trim());
    switchMode("sent");
  }

  if (mode === "sent") {
    return (
      <div className="flex flex-col gap-4.5">
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
          Vérifiez votre boîte <NoBreak>e-mail</NoBreak>
        </h2>
        <p className="m-0 text-16 leading-[1.5]">
          Un lien de connexion vient d&apos;être envoyé à <strong>{sentTo}</strong>.
        </p>
        <p className="m-0 text-15 leading-[1.5] text-muted">
          Il est valable 10 minutes et ne sert qu&apos;une fois. Rien reçu ? Vérifiez l&apos;adresse
          saisie et vos courriers indésirables.
        </p>
        <div className="flex flex-wrap justify-between gap-2 text-14">
          <LinkButton onClick={() => switchMode("magic")}>Utiliser une autre adresse</LinkButton>
          <LinkButton onClick={() => switchMode("password")}>
            Se connecter avec un mot de passe
          </LinkButton>
        </div>
        <DiscoverFooter />
      </div>
    );
  }

  const emailField = (
    <FormField label="Adresse e-mail" error={fieldErrors.email}>
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
  );

  if (mode === "magic") {
    return (
      <AuthForm onSubmit={submitMagicLink}>
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
          Recevoir un lien par <NoBreak>e-mail</NoBreak>
        </h2>
        <p className="m-0 text-15 text-muted">
          Saisissez votre adresse : vous recevrez un lien de connexion, sans mot de passe.
        </p>
        {error ? <FormAlert>{error}</FormAlert> : null}
        {emailField}
        <Button type="submit" size="2xl" fullWidth loading={pending}>
          Recevoir le lien
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-14">
          <LinkButton onClick={() => switchMode("password")}>
            Se connecter avec un mot de passe
          </LinkButton>
        </div>
        <DiscoverFooter />
      </AuthForm>
    );
  }

  return (
    <AuthForm onSubmit={submitPassword}>
      <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
        Se connecter
      </h2>
      <p className="m-0 text-15 text-muted">{subtitle}</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {emailField}
      <FormField label="Mot de passe" error={fieldErrors.password}>
        <Input
          ref={passwordRef}
          type="password"
          name="password"
          size="lg"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </FormField>
      <Button type="submit" size="2xl" fullWidth loading={pending}>
        Accéder à mon espace
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-14">
        <Link href="/mot-de-passe-oublie" className={authLinkClass}>
          Mot de passe oublié ?
        </Link>
        <LinkButton onClick={() => switchMode("magic")}>Recevoir un lien par e-mail</LinkButton>
      </div>
      <DiscoverFooter />
    </AuthForm>
  );
}

function AuthForm({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  // Validation maison (messages en français) plutôt que les bulles du navigateur. `post` :
  // envoyé avant l'hydratation, le formulaire ne met jamais le mot de passe dans l'adresse.
  return (
    <form method="post" noValidate onSubmit={onSubmit} className="flex flex-col gap-4.5">
      {children}
    </form>
  );
}

export function DiscoverFooter() {
  return (
    <p className="m-0 border-t border-line pt-4.5 text-14 text-ink-soft">
      Pas encore parrain ?{" "}
      <Link href="/decouvrir" className={authLinkClass}>
        Découvrir le parrainage
      </Link>
    </p>
  );
}
