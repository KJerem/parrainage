import { magicLinkEmail, newMessageEmail, resetPasswordEmail } from "./templates.js";

const url = "http://localhost:3000/api/auth/magic-link/verify?token=abc&callbackURL=%2Fparrain";

describe("modèles d'e-mail", () => {
  it.each([
    ["lien magique", magicLinkEmail(url), "Votre lien de connexion"],
    ["mot de passe", resetPasswordEmail(url), "Réinitialisation de votre mot de passe"],
  ])("%s : sujet en français et lien seul", (_, mail, subject) => {
    expect(mail.subject).toBe(subject);
    expect(mail.text).toContain(url);
    expect(mail.html).toContain('lang="fr"');
    // L'esperluette du lien est échappée dans l'attribut href.
    expect(mail.html).toContain(url.replaceAll("&", "&amp;"));
    expect(mail.html).not.toContain(`href="${url}"`);
  });

  it("nouveau message : notification et lien seulement", () => {
    const link = "http://localhost:3000/parrain/messages/seed-conversation-claire-koffi";
    const mail = newMessageEmail(link);
    expect(mail.subject).toBe("Nouveau message sur Parrainage LRT");
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(link);
    expect(mail.text).not.toMatch(/valable|ignorez/);
  });

  it("échappe un lien piégé", () => {
    const mail = magicLinkEmail('http://x/"><script>alert(1)</script>');
    expect(mail.html).not.toContain("<script>");
  });
});
