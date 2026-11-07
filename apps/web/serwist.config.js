// @ts-check
import { randomUUID } from "node:crypto";
import { serwist } from "@serwist/next/config";

// `next build && serwist build` : le service worker est assemblé à part, avec la liste des fichiers
// statiques du build. Seule page précachée : celle du hors-ligne (aucune donnée, aucun compte).
export default serwist({
  swSrc: "src/sw/sw.ts",
  swDest: "public/sw.js",
  precachePrerendered: false,
  additionalPrecacheEntries: [{ url: "/hors-ligne", revision: randomUUID() }],
});
