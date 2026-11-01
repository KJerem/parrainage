import { GetObjectCommand, HeadBucketCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { createS3Client } from "./s3-client.js";

/** Durée de validité d'une URL de lecture présignée, en secondes. */
export const PRESIGNED_GET_TTL_SECONDS = 120;

export interface PresignGetOptions {
  /** Type renvoyé par le stockage (celui enregistré pour le média). */
  contentType?: string;
  /** Nom du fichier proposé : la réponse devient un téléchargement. */
  downloadName?: string;
}

/** En-tête Content-Disposition d'un téléchargement, nom accentué compris (RFC 6266). */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

@Injectable()
export class StorageService {
  readonly bucket: string;
  /** Client pour les appels serveur → stockage (réseau interne). */
  readonly client: S3Client;
  /** Client réservé à la signature d'URL : l'hôte doit être celui que le navigateur atteint. */
  readonly publicClient: S3Client;

  constructor(config: ConfigService<Env, true>) {
    const settings = {
      region: config.get("S3_REGION", { infer: true }),
      accessKey: config.get("S3_ACCESS_KEY", { infer: true }),
      secretKey: config.get("S3_SECRET_KEY", { infer: true }),
    };
    this.bucket = config.get("S3_BUCKET", { infer: true });
    this.client = createS3Client({
      ...settings,
      endpoint: config.get("S3_ENDPOINT", { infer: true }),
    });
    this.publicClient = createS3Client({
      ...settings,
      endpoint: config.get("S3_PUBLIC_ENDPOINT", { infer: true }),
    });
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  /**
   * URL de lecture présignée (120 s) sur l'hôte public du stockage. La signature est locale :
   * aucun appel réseau, l'existence de l'objet n'est pas vérifiée.
   */
  presignGet(key: string, options: PresignGetOptions = {}): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // Contenus d'enfants : jamais conservés par un cache intermédiaire ou le navigateur.
      ResponseCacheControl: "private, no-store",
      ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
      ...(options.downloadName
        ? { ResponseContentDisposition: attachmentDisposition(options.downloadName) }
        : {}),
    });
    return getSignedUrl(this.publicClient, command, { expiresIn: PRESIGNED_GET_TTL_SECONDS });
  }
}
