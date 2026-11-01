import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authMessages } from "@/lib/auth-errors";
import { LoginForm } from "./login-form";

const mocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInMagicLink: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: mocks.signInEmail, magicLink: mocks.signInMagicLink } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

const subtitle = "Espace réservé aux parrains et marraines de l'association.";

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Adresse e-mail"), email);
  await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Accéder à mon espace" }));
  return user;
}

afterEach(cleanup);

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
});

describe("LoginForm", () => {
  it("affiche des champs vides avec l'autocomplétion attendue", () => {
    render(<LoginForm next={null} subtitle={subtitle} />);
    const email = screen.getByLabelText<HTMLInputElement>("Adresse e-mail");
    const password = screen.getByLabelText<HTMLInputElement>("Mot de passe");
    expect(email.value).toBe("");
    expect(email.autocomplete).toBe("email");
    expect(password.value).toBe("");
    expect(password.autocomplete).toBe("current-password");
    expect(screen.getByRole("heading", { name: "Se connecter" })).toBeTruthy();
    expect(screen.getByText(subtitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Découvrir le parrainage" }).getAttribute("href")).toBe(
      "/decouvrir",
    );
  });

  it("valide les champs en français sans appeler l'API", async () => {
    render(<LoginForm next={null} subtitle={subtitle} />);
    await userEvent.click(screen.getByRole("button", { name: "Accéder à mon espace" }));
    expect(screen.getByText(authMessages.missingEmail)).toBeTruthy();
    expect(screen.getByText(authMessages.missingPassword)).toBeTruthy();
    expect(screen.getByLabelText("Adresse e-mail").getAttribute("aria-invalid")).toBe("true");
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("se connecte puis rejoint la destination demandée", async () => {
    mocks.signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
    render(<LoginForm next="/parrain/compte" subtitle={subtitle} />);
    await fillAndSubmit(" claire.m@exemple.fr ", "motdepasse");
    expect(mocks.signInEmail).toHaveBeenCalledWith({
      email: "claire.m@exemple.fr",
      password: "motdepasse",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/parrain/compte");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("rejoint l'accueil (orientation par rôle) sans destination", async () => {
    mocks.signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
    render(<LoginForm next={null} subtitle={subtitle} />);
    await fillAndSubmit("koffi@relais.exemple.tg", "motdepasse");
    expect(mocks.replace).toHaveBeenCalledWith("/");
  });

  it.each([
    [{ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }, authMessages.invalidCredentials],
    [{ status: 429, code: "TOO_MANY_REQUESTS" }, authMessages.tooManyAttempts],
  ])("annonce l'erreur %j", async (error, message) => {
    mocks.signInEmail.mockResolvedValue({ data: null, error });
    render(<LoginForm next={null} subtitle={subtitle} />);
    await fillAndSubmit("claire.m@exemple.fr", "mauvais");
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(document.activeElement).toBe(screen.getByLabelText("Mot de passe"));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("signale un réseau coupé", async () => {
    mocks.signInEmail.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginForm next={null} subtitle={subtitle} />);
    await fillAndSubmit("claire.m@exemple.fr", "motdepasse");
    expect(screen.getByRole("alert").textContent).toBe(authMessages.network);
  });

  it("bascule vers le lien par e-mail et confirme l'envoi", async () => {
    mocks.signInMagicLink.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    render(<LoginForm next="/parrain" subtitle={subtitle} />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "claire.m@exemple.fr");
    await user.click(screen.getByRole("button", { name: "Recevoir un lien par e-mail" }));

    const heading = screen.getByRole("heading", { name: "Recevoir un lien par e-mail" });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByLabelText("Mot de passe")).toBeNull();
    // L'adresse déjà saisie est conservée.
    expect(screen.getByLabelText<HTMLInputElement>("Adresse e-mail").value).toBe(
      "claire.m@exemple.fr",
    );

    await user.click(screen.getByRole("button", { name: "Recevoir le lien" }));
    expect(mocks.signInMagicLink).toHaveBeenCalledWith({
      email: "claire.m@exemple.fr",
      callbackURL: "/parrain",
      errorCallbackURL: "/connexion?next=%2Fparrain",
    });
    expect(screen.getByText(/Un lien de connexion vient d.être envoyé à/).textContent).toContain(
      "claire.m@exemple.fr",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Vérifiez votre boîte e-mail" }),
    );
  });

  it("ouvre le formulaire du lien quand le lien reçu n'est plus valable", () => {
    render(<LoginForm next={null} subtitle={subtitle} linkError={authMessages.invalidMagicLink} />);
    expect(screen.getByRole("heading", { name: "Recevoir un lien par e-mail" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(authMessages.invalidMagicLink);
  });
});
