import { createRequire } from "node:module";

// ffmpeg-static est un module CommonJS dont `module.exports` est le chemin du binaire : ses
// types (export default) ne correspondent pas à l'import ESM, d'où ce require explicite.
const require = createRequire(import.meta.url);

/** Chemin du binaire ffmpeg fourni par ffmpeg-static (`null` si la plateforme n'en a pas). */
export const ffmpegPath = require("ffmpeg-static") as string | null;
