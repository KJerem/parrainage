import {
  childSubmittedEmail,
  magicLinkEmail,
  messageHeldEmail,
  messageMaskedEmail,
  newMessageEmail,
  newsPublishedBureauEmail,
  newsPublishedEmail,
  resetPasswordEmail,
  resultsSentEmail,
} from "./templates.js";

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

  describe("avis de modération", () => {
    const link = "http://localhost:3000/parrain/messages/seed-conversation-paul-kofi";
    const notice = {
      url: link,
      audience: "parrain" as const,
      reason: "Contact direct hors plateforme",
      rule: "Aucun échange direct hors plateforme entre parrain et enfant.",
    };

    it("message retenu : motif, règle et lien", () => {
      const mail = messageHeldEmail(notice);
      expect(mail.subject).toBe("Votre message n'a pas été transmis");
      expect(mail.text).toContain("Motif : Contact direct hors plateforme.");
      expect(mail.text).toContain(notice.rule);
      expect(mail.text).toContain(link);
      expect(mail.html).toContain(link);
    });

    it("message masqué : transmis en partie", () => {
      const mail = messageMaskedEmail(notice);
      expect(mail.subject).toBe("Votre message a été transmis en partie");
      expect(mail.text).toContain("Motif : Contact direct hors plateforme.");
    });

    it("s'adresse au relais quand l'auteur est un enfant", () => {
      expect(messageHeldEmail({ ...notice, audience: "relais" }).subject).toBe(
        "Le message d'un enfant n'a pas été transmis",
      );
      expect(messageMaskedEmail({ ...notice, audience: "relais" }).subject).toBe(
        "Le message d'un enfant a été transmis en partie",
      );
    });

    it("sans motif précis, renvoie vers l'association", () => {
      const mail = messageHeldEmail({ ...notice, reason: null, rule: null });
      expect(mail.text).not.toContain("Motif");
      expect(mail.text).toContain("écrivez à l'association");
    });
  });

  it.each([
    ["nouvelle", newsPublishedEmail, "Une nouvelle de votre relais sur Parrainage LRT"],
    ["nouvelle au bureau", newsPublishedBureauEmail, "Un relais a publié une nouvelle"],
    ["résultats", resultsSentEmail, "De nouveaux résultats scolaires sur Parrainage LRT"],
    ["dossier", childSubmittedEmail, "Un dossier d'enfant à vérifier"],
  ])("%s : un sujet et un lien, rien de plus", (_, build, subject) => {
    const link = "http://localhost:3000/parrain";
    const mail = build(link);
    expect(mail.subject).toBe(subject);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(link);
  });

  it("échappe un lien piégé", () => {
    const mail = magicLinkEmail('http://x/"><script>alert(1)</script>');
    expect(mail.html).not.toContain("<script>");
  });
});
