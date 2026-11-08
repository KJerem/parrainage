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

/** Destinataire d'un avis de modération : l'auteur adulte, ou le relais pour un enfant. */
export type ModerationNoticeAudience = "parrain" | "relais";

interface ModerationNotice {
  url: string;
  audience: ModerationNoticeAudience;
  /** Motif (libellé fixe, jamais un extrait du message) ; `null` pour « Autre ». */
  reason: string | null;
  /** Règle de la charte concernée. */
  rule: string | null;
}

function noticeNotes({ reason, rule }: ModerationNotice): string[] {
  return [
    ...(reason ? [`Motif : ${reason}.`] : []),
    ...(rule ? [rule] : []),
    ...(reason ? [] : ["Pour en savoir plus, écrivez à l'association depuis votre espace."]),
  ];
}

/** Message retenu : motif et règle de la charte, aucun extrait du message. */
export function messageHeldEmail(notice: ModerationNotice): MailContent {
  const forRelais = notice.audience === "relais";
  return linkEmail({
    subject: forRelais
      ? "Le message d'un enfant n'a pas été transmis"
      : "Votre message n'a pas été transmis",
    intro: forRelais
      ? "L'association a relu le message d'un enfant que vous suivez et ne l'a pas transmis. Vous pourrez en parler avec lui à la prochaine session."
      : "L'association a relu votre message et ne l'a pas transmis à l'enfant.",
    action: "Voir la conversation",
    url: notice.url,
    notes: noticeNotes(notice),
  });
}

/** Message transmis avec un passage ou une pièce jointe en moins. */
export function messageMaskedEmail(notice: ModerationNotice): MailContent {
  const forRelais = notice.audience === "relais";
  return linkEmail({
    subject: forRelais
      ? "Le message d'un enfant a été transmis en partie"
      : "Votre message a été transmis en partie",
    intro: forRelais
      ? "L'association a relu le message d'un enfant que vous suivez : elle en a retiré une partie avant de le transmettre."
      : "L'association a relu votre message : elle en a retiré une partie avant de le transmettre à l'enfant.",
    action: "Voir la conversation",
    url: notice.url,
    notes: noticeNotes(notice),
  });
}

/** Nouvelle du relais : le lien mène au fil, aucune ligne de la nouvelle. */
export function newsPublishedEmail(url: string): MailContent {
  return linkEmail({
    subject: "Une nouvelle de votre relais sur Parrainage LRT",
    intro: "Le relais qui suit votre filleul a publié une nouvelle sur la plateforme.",
    action: "Lire la nouvelle",
    url,
    notes: ["Connectez-vous à votre espace pour la découvrir."],
  });
}

/** Nouvelle adressée au bureau. */
export function newsPublishedBureauEmail(url: string): MailContent {
  return linkEmail({
    subject: "Un relais a publié une nouvelle",
    intro: "Un relais a publié une nouvelle et vous a mis parmi ses destinataires.",
    action: "Ouvrir mon espace",
    url,
    notes: [],
  });
}

/** Résultats envoyés : aucune note ni appréciation dans l'e-mail. */
export function resultsSentEmail(url: string): MailContent {
  return linkEmail({
    subject: "De nouveaux résultats scolaires sur Parrainage LRT",
    intro: "Le relais qui suit votre filleul a envoyé de nouveaux résultats scolaires.",
    action: "Voir les résultats",
    url,
    notes: ["Connectez-vous à votre espace pour les consulter."],
  });
}

/** Dossier d'enfant envoyé au bureau : aucune donnée de l'enfant dans l'e-mail. */
export function childSubmittedEmail(url: string): MailContent {
  return linkEmail({
    subject: "Un dossier d'enfant à vérifier",
    intro: "Un relais vient d'envoyer le dossier d'un enfant au bureau.",
    action: "Ouvrir mon espace",
    url,
    notes: ["Vérifiez le dossier avant de proposer un parrain."],
  });
}

/** Demande d'appel vidéo d'un parrain : le lien mène à la conversation, où le relais répond. */
export function callRequestedEmail(url: string): MailContent {
  return linkEmail({
    subject: "Une demande d'appel vidéo",
    intro: "Un parrain vous demande un appel vidéo avec son filleul.",
    action: "Répondre à la demande",
    url,
    notes: ["Confirmez le créneau demandé, ou proposez-en d'autres."],
  });
}

/** Le relais propose d'autres créneaux. */
export function callSlotsProposedEmail(url: string): MailContent {
  return linkEmail({
    subject: "Choisissez un créneau pour votre appel vidéo",
    intro: "Le relais vous propose d'autres créneaux pour votre appel vidéo.",
    action: "Choisir un créneau",
    url,
    notes: ["Connectez-vous à votre espace pour choisir celui qui vous convient."],
  });
}

/** Appel confirmé : le fichier agenda est joint, sans nom ni donnée de l'enfant. */
export function callConfirmedEmail(url: string): MailContent {
  return linkEmail({
    subject: "Appel vidéo confirmé",
    intro: "L'appel vidéo est confirmé. Ajoutez-le à votre agenda avec le fichier joint.",
    action: "Voir l'appel",
    url,
    notes: ["La salle ouvre quelques minutes avant l'appel. Les appels ne sont pas enregistrés."],
  });
}
