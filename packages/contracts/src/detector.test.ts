import { describe, expect, it } from "vitest";
import { type AlertType, detectAlerts } from "./detector.js";

/** Passages détectés, lus dans le texte d'origine. */
const passages = (text: string) =>
  detectAlerts(text).spans.map((s) => [s.type, text.slice(s.start, s.end)] as const);

const types = (text: string) => detectAlerts(text).types;

describe("detectAlerts : téléphones", () => {
  it.each<[string, string]>([
    ["Mon numéro : 06 39 98 12 34", "06 39 98 12 34"],
    ["appelle au 06.39.98.12.34 stp", "06.39.98.12.34"],
    ["06-39-98-12-34", "06-39-98-12-34"],
    ["0639981234", "0639981234"],
    ["+33 6 39 98 12 34", "+33 6 39 98 12 34"],
    ["Écris au +228 90 12 34 56", "+228 90 12 34 56"],
    ["00228 90123456", "00228 90123456"],
    ["90 12 34 56", "90 12 34 56"],
    ["06/39/98/12/34", "06/39/98/12/34"],
    ["0 6 3 9 9 8 1 2 3 4", "0 6 3 9 9 8 1 2 3 4"],
    ["(0)6 39 98 12 34", "0)6 39 98 12 34"],
    ["０６ ３９ ９８ １２ ３４", "０６ ３９ ９８ １２ ３４"],
    ["mon code 12345678901234", "12345678901234"],
    ["j'ai un 06 39 98 12 34", "06 39 98 12 34"],
    ["06,39,98,12,34", "06,39,98,12,34"],
    ["c'est le 06, 39, 98, 12, 34", "06, 39, 98, 12, 34"],
    ["0️⃣6️⃣3️⃣9️⃣9️⃣8️⃣1️⃣2️⃣3️⃣4️⃣ !", "0️⃣6️⃣3️⃣9️⃣9️⃣8️⃣1️⃣2️⃣3️⃣4️⃣"],
    ["Le 31/10/2026, appelle le 06 39 98 12 34", "06 39 98 12 34"],
  ])("repère « %s »", (text, passage) => {
    expect(passages(text)).toContainEqual(["PHONE", passage]);
  });

  it("repère un numéro écrit en lettres, avec ses positions d'origine", () => {
    const text = "C'est zéro six trente-neuf quatre-vingt-dix-huit douze trente-quatre, à bientôt";
    expect(passages(text)).toEqual([
      ["PHONE", "zéro six trente-neuf quatre-vingt-dix-huit douze trente-quatre"],
    ]);
  });

  it("repère un numéro écrit en lettres entrecoupé de virgules", () => {
    const text = "zéro six, trente neuf, quatre vingt dix huit, douze, trente quatre";
    expect(passages(text)).toEqual([["PHONE", text]]);
  });

  it("repère un numéro mêlant chiffres et lettres", () => {
    expect(types("zéro six 39 98 douze 34")).toEqual(["PHONE"]);
    expect(types("soixante-dix-sept, vingt et un")).toEqual([]);
    expect(types("quatre-vingt-dix soixante et onze vingt et un quatre-vingts")).toEqual(["PHONE"]);
  });

  it("repère l'annonce d'un numéro", () => {
    expect(types("Donne-moi ton numéro")).toEqual(["PHONE"]);
    expect(types("Appelle-moi ce soir")).toEqual(["PHONE"]);
    expect(types("envoie-moi un SMS")).toEqual(["PHONE"]);
  });
});

describe("detectAlerts : e-mails, liens et réseaux sociaux", () => {
  it.each<[string, AlertType, string]>([
    ["Écris-moi à claire.m@gmail.com !", "EMAIL", "claire.m@gmail.com"],
    ["claire @ hotmail . fr", "EMAIL", "claire @ hotmail . fr"],
    [
      "claire point martin arobase gmail point com",
      "EMAIL",
      "claire point martin arobase gmail point com",
    ],
    ["claire.m (at) laposte.net", "EMAIL", "claire.m (at) laposte.net"],
    ["CLAIRE.M@EXEMPLE.FR", "EMAIL", "CLAIRE.M@EXEMPLE.FR"],
    ["mon adresse mail, c'est claire", "EMAIL", "mon adresse mail"],
    ["va sur https://exemple.com/page?x=1", "URL", "https://exemple.com/page?x=1"],
    ["www.monsite.org", "URL", "www.monsite.org"],
    ["regarde lrt-parrainage.fr", "URL", "lrt-parrainage.fr"],
    ["le site aicha.tg", "URL", "aicha.tg"],
    ["exemple point com", "URL", "exemple point com"],
    ["va sur monsite . com", "URL", "monsite . com"],
    ["regarde monsite. fr", "URL", "monsite. fr"],
    ["écris sur W h a t s a p p", "SOCIAL", "W h a t s a p p"],
    ["i.n.s.t.a.g.r.a.m", "SOCIAL", "i.n.s.t.a.g.r.a.m"],
    ["ajoute-moi sur WhatsApp", "SOCIAL", "WhatsApp"],
    ["wa.me/22890123456", "SOCIAL", "wa.me"],
    ["mon insta c'est @aicha_s", "SOCIAL", "insta"],
    ["mon insta c'est @aicha_s", "SOCIAL", "@aicha_s"],
    ["sur Snap ou TikTok", "SOCIAL", "TikTok"],
    ["Facebook, Messenger, Telegram", "SOCIAL", "Telegram"],
    ["écris-moi sur Signal", "SOCIAL", "sur Signal"],
    ["mon pseudo Discord", "SOCIAL", "Discord"],
  ])("« %s » → %s", (text, type, passage) => {
    expect(passages(text)).toContainEqual([type, passage]);
  });

  it("ne compte pas le domaine ni l'arobase d'un e-mail comme lien ou pseudo", () => {
    expect(types("claire.m@gmail.com")).toEqual(["EMAIL"]);
    expect(types("aicha @gmail.com")).toEqual(["EMAIL"]);
  });
});

describe("detectAlerts : adresses, argent, rendez-vous", () => {
  it.each<[string, AlertType, string]>([
    ["J'habite au 12 rue des Tilleuls", "ADDRESS", "12 rue des Tilleuls"],
    ["3, avenue de la Paix", "ADDRESS", "3, avenue de la Paix"],
    ["j'habite avenue de la Libération 5", "ADDRESS", "avenue de la Libération 5"],
    ["rue Foch 12", "ADDRESS", "rue Foch 12"],
    ["envoie-moi 5000", "MONEY", "envoie-moi 5000"],
    ["donne-moi 10 euros", "MONEY", "donne-moi 10 euros"],
    ["8 bis allée des Roses", "ADDRESS", "8 bis allée des Roses"],
    ["BP 1234 Lomé", "ADDRESS", "BP 1234"],
    ["69003 Lyon", "ADDRESS", "69003 Lyon"],
    ["donne-moi ton adresse", "ADDRESS", "ton adresse"],
    ["par Western Union", "MONEY", "Western Union"],
    ["un transfert T-Money ou Flooz", "MONEY", "T-Money"],
    ["un transfert T-Money ou Flooz", "MONEY", "Flooz"],
    ["avec mobile money", "MONEY", "mobile money"],
    ["peux-tu m'envoyer de l'argent ?", "MONEY", "envoyer de l'argent"],
    ["j'ai besoin d'argent", "MONEY", "besoin d'argent"],
    ["Viens chez moi samedi", "MEETING", "Viens chez"],
    ["rendez-vous à la maison", "MEETING", "rendez-vous à la maison"],
    ["rdv devant ton adresse", "MEETING", "rdv devant ton adresse"],
    ["je viendrai te voir à la maison", "MEETING", "viendrai te voir à la maison"],
  ])("« %s » → %s", (text, type, passage) => {
    expect(passages(text)).toContainEqual([type, passage]);
  });

  it("cumule plusieurs alertes, triées par position", () => {
    const text = "Viens chez moi, 12 rue des Lilas, appelle le 06 39 98 12 34 ou WhatsApp";
    expect(detectAlerts(text).types).toEqual(["PHONE", "SOCIAL", "ADDRESS", "MEETING"]);
    const starts = detectAlerts(text).spans.map((s) => s.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe("detectAlerts : faux positifs évités", () => {
  it.each([
    "Bravo pour ta rentrée Aïcha ! Déléguée de classe, je suis très fière de toi.",
    "Tu as eu 13,4 / 20 au premier trimestre, contre 11,8/20 l'an dernier.",
    "Rang : 5 / 48, puis 5e/48 au trimestre suivant",
    "L'année scolaire 2026-2027 commence, après 2025/2026.",
    "En CM2 puis en 6e, comme son frère en CE1.",
    "Rendez-vous le 31/10/2026, le 14.11.26 ou le 2026-11-21.",
    "Le numéro masqué : 06 ·· ·· ·· ··",
    "+228 ·· ·· ·· ··",
    "J'ai 12 ans, 3 frères et 2 sœurs.",
    "Le 14 novembre 2026 à 11 h 30, ou à 11:30.",
    "25 € par mois, soit 290 € versés en 2026 et 1 500 FCFA de fournitures.",
    "M. Koffi m'a dit que Mme Ama est gentille.",
    "Le signal de la radio est faible.",
    "Il fait 30 degrés à Lomé.",
    "Dans un instant, à la maison.",
    "Passe le bonjour à toute la maison.",
    "J'ai vingt élèves dans ma classe et trente-deux chaises.",
    "Un, deux, trois, nous irons au bois.",
    "Je suis sous la moustiquaire, je n'ai besoin de rien.",
    "Merci pour le ballon ! Je joue au foot avec mes 4 amis.",
    "Nous avons 12000 habitants et 10000 FCFA de budget.",
    "Classe de 48 élèves, 5 cours par jour.",
    "L'école a coûté 10 000 000 FCFA et 12.500.000 F de travaux.",
    "Notes : 12, 15, 18, 20 et 14.",
    "J'ai 12,5 de moyenne et 13,25 en maths.",
    "Envoie-moi 2 photos de ton école !",
    "Dans la rue il y a 5 enfants.",
    "Sur le chemin de l'école j'ai vu 3 chiens.",
    "Je suis content. Franchement merci.",
    "Bravo.Continue comme ça.",
  ])("aucune alerte : « %s »", (text) => {
    expect(detectAlerts(text)).toEqual({ types: [], spans: [] });
  });

  it("ne neutralise pas une date collée à d'autres chiffres", () => {
    expect(types("06/12/98 12 34")).toEqual(["PHONE"]);
    expect(types("12.05.2026.12.34")).toEqual(["PHONE"]);
  });

  it("garde les positions du texte d'origine malgré les accents et ligatures", () => {
    const text = "Élève très fière ﬁnalement : écris à aïcha@exemple.tg";
    const [span] = detectAlerts(text).spans;
    expect(span).toEqual({ type: "EMAIL", start: text.indexOf("aïcha"), end: text.length });
  });

  it("renvoie un résultat vide pour un texte vide", () => {
    expect(detectAlerts("")).toEqual({ types: [], spans: [] });
  });
});
