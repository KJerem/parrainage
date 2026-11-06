// Règle du projet : un e-mail ne contient qu'une notification et un lien, aucune donnée personnelle.

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const SIGNATURE = "L'association LRT";
const IGNORE = "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** E-mail à un seul bouton ; `notes` : lignes sous le bouton (validité du lien, consigne…). */
function linkEmail(options: {
  subject: string;
  intro: string;
  action: string;
  url: string;
  notes: readonly string[];
}): MailContent {
  const { subject, intro, action, url, notes } = options;
  const text = ["Bonjour,", "", intro, "", url, "", ...notes, "", SIGNATURE].join("\n");
  const href = escapeHtml(url);
  const noteHtml = notes
    .map(
      (note) =>
        `      <p style="margin:0 0 8px;font-size:14px;color:#5a6662">${escapeHtml(note)}</p>\n`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f6f4ee;font-family:Arial,sans-serif;color:#17201d">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <p style="margin:0 0 16px;font-size:16px">Bonjour,</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escapeHtml(intro)}</p>
      <p style="margin:0 0 24px">
        <a href="${href}" style="display:inline-block;background:#1e5c4e;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escapeHtml(action)}</a>
      </p>
${noteHtml}      <p style="margin:16px 0 0;font-size:14px;color:#5a6662">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${href}" style="color:#1e5c4e;word-break:break-all">${href}</a></p>
      <p style="margin:24px 0 0;font-size:14px">${SIGNATURE}</p>
    </div>
  </body>
</html>`;
  return { subject, text, html };
}

export function magicLinkEmail(url: string): MailContent {
  return linkEmail({
    subject: "Votre lien de connexion",
    intro: "Voici votre lien pour vous connecter à la plateforme de parrainage LRT.",
    action: "Me connecter",
    url,
    notes: ["Ce lien est valable 10 minutes et ne fonctionne qu'une seule fois.", IGNORE],
  });
}

export function resetPasswordEmail(url: string): MailContent {
  return linkEmail({
    subject: "Réinitialisation de votre mot de passe",
    intro: "Une réinitialisation du mot de passe de votre compte a été demandée.",
    action: "Choisir un nouveau mot de passe",
    url,
    notes: ["Ce lien est valable 1 heure.", IGNORE],
  });
}

/**
 * Nouveau message d'adulte à adulte : aucune ligne du message, seulement le lien vers la page
 * Messages (connexion requise). Jamais d'e-mail pour un message destiné à un enfant.
 */
export function newMessageEmail(url: string): MailContent {
  return linkEmail({
    subject: "Nouveau message sur Parrainage LRT",
    intro: "Vous avez reçu un nouveau message sur la plateforme de parrainage LRT.",
    action: "Lire le message",
    url,
    notes: ["Connectez-vous à votre espace pour le lire et y répondre."],
  });
}
