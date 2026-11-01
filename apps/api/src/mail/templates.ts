// Règle du projet : un e-mail ne contient qu'une notification et un lien, aucune donnée personnelle.

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const SIGNATURE = "L'association LRT";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function linkEmail(options: {
  subject: string;
  intro: string;
  action: string;
  url: string;
  validity: string;
}): MailContent {
  const { subject, intro, action, url, validity } = options;
  const ignore = "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.";
  const text = ["Bonjour,", "", intro, "", url, "", validity, ignore, "", SIGNATURE].join("\n");
  const href = escapeHtml(url);
  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f6f4ee;font-family:Arial,sans-serif;color:#17201d">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <p style="margin:0 0 16px;font-size:16px">Bonjour,</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escapeHtml(intro)}</p>
      <p style="margin:0 0 24px">
        <a href="${href}" style="display:inline-block;background:#1e5c4e;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escapeHtml(action)}</a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#5a6662">${escapeHtml(validity)}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#5a6662">${escapeHtml(ignore)}</p>
      <p style="margin:0;font-size:14px;color:#5a6662">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${href}" style="color:#1e5c4e;word-break:break-all">${href}</a></p>
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
    validity: "Ce lien est valable 10 minutes et ne fonctionne qu'une seule fois.",
  });
}

export function resetPasswordEmail(url: string): MailContent {
  return linkEmail({
    subject: "Réinitialisation de votre mot de passe",
    intro: "Une réinitialisation du mot de passe de votre compte a été demandée.",
    action: "Choisir un nouveau mot de passe",
    url,
    validity: "Ce lien est valable 1 heure.",
  });
}
