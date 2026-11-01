import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authMessages } from "@/lib/auth-errors";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ResetPasswordForm } from "./reset-password-form";

const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ authClient: mocks }));

afterEach(cleanup);

beforeEach(() => {
  mocks.requestPasswordReset.mockReset();
  mocks.resetPassword.mockReset();
});

describe("ForgotPasswordForm", () => {
  it("demande le lien puis confirme sans révéler si le compte existe", async () => {
    mocks.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "inconnu@exemple.fr");
    await user.click(screen.getByRole("button", { name: "Recevoir le lien" }));

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "inconnu@exemple.fr",
      redirectTo: "/reinitialiser-mot-de-passe",
    });
    expect(screen.getByText(/Si un compte correspond à/).textContent).toContain(
      "inconnu@exemple.fr",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Vérifiez votre boîte e-mail" }),
    );
  });

  it("annonce la limite de tentatives", async () => {
    mocks.requestPasswordReset.mockResolvedValue({
      data: null,
      error: { status: 429, code: "TOO_MANY_REQUESTS" },
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText("Adresse e-mail"), "claire.m@exemple.fr");
    await user.click(screen.getByRole("button", { name: "Recevoir le lien" }));
    expect(screen.getByRole("alert").textContent).toBe(authMessages.tooManyAttempts);
  });
});

describe("ResetPasswordForm", () => {
  async function submit(password: string, confirmation: string) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nouveau mot de passe"), password);
    await user.type(screen.getByLabelText("Confirmer le mot de passe"), confirmation);
    await user.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
  }

  it("vérifie la longueur et la confirmation avant l'envoi", async () => {
    render(<ResetPasswordForm token="jeton" />);
    await submit("court", "court");
    expect(screen.getByText(authMessages.passwordTooShort)).toBeTruthy();
    cleanup();

    render(<ResetPasswordForm token="jeton" />);
    await submit("assez-long-1", "assez-long-2");
    expect(screen.getByText(authMessages.passwordMismatch)).toBeTruthy();
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("enregistre le mot de passe avec le jeton du lien", async () => {
    mocks.resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    render(<ResetPasswordForm token="jeton" />);
    await submit("nouveau-secret", "nouveau-secret");
    expect(mocks.resetPassword).toHaveBeenCalledWith({
      newPassword: "nouveau-secret",
      token: "jeton",
    });
    expect(screen.getByRole("heading", { name: "Mot de passe modifié" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Se connecter" }).getAttribute("href")).toBe(
      "/connexion",
    );
  });

  it("propose un nouveau lien quand le jeton a expiré", async () => {
    mocks.resetPassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: "INVALID_TOKEN" },
    });
    render(<ResetPasswordForm token="perime" />);
    await submit("nouveau-secret", "nouveau-secret");
    expect(screen.getByRole("alert").textContent).toContain(authMessages.invalidResetLink);
    expect(screen.getByRole("link", { name: "Demander un nouveau lien" })).toBeTruthy();
  });
});
