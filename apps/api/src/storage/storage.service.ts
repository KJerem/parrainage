import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  type S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { createS3Client } from "./s3-client.js";

/** Durée de validité d'une URL de lecture présignée, en secondes. */
export const PRESIGNED_GET_TTL_SECONDS = 120;

/** Durée de validité d'une URL d'envoi présignée (PUT simple ou part multipart), en secondes. */
export const PRESIGNED_PUT_TTL_SECONDS = 300;

export interface StoredPart {
  partNumber: number;
  etag: string;
  sizeBytes: number;
}

/** Erreur « objet introuvable » du SDK S3 (HeadObject, GetObject). */
export function isNotFound(error: unknown): boolean {
  const { name, $metadata } = (error ?? {}) as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return name === "NotFound" || name === "NoSuchKey" || $metadata?.httpStatusCode === 404;
}

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

  /**
   * URL de dépôt présignée (300 s) sur l'hôte public. Le type et la taille sont signés : le
   * navigateur doit envoyer exactement ce Content-Type, et un corps d'une autre taille est refusé.
   */
  presignPut(key: string, contentType: string, sizeBytes: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(this.publicClient, command, {
      expiresIn: PRESIGNED_PUT_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
  }

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );
    if (!UploadId) {
      throw new Error("Le stockage n'a pas ouvert d'envoi multipart");
    }
    return UploadId;
  }

  /** URL de dépôt d'une part. La taille est signée : une part d'une autre taille est refusée. */
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    sizeBytes: number,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: sizeBytes,
    });
    return getSignedUrl(this.publicClient, command, {
      expiresIn: PRESIGNED_PUT_TTL_SECONDS,
      signableHeaders: new Set(["content-length"]),
    });
  }

  /** Parts déjà reçues d'un envoi multipart, par numéro croissant. */
  async listParts(key: string, uploadId: string): Promise<StoredPart[]> {
    const parts: StoredPart[] = [];
    let marker: string | undefined;
    for (;;) {
      const page = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          ...(marker ? { PartNumberMarker: marker } : {}),
        }),
      );
      for (const part of page.Parts ?? []) {
        if (part.PartNumber !== undefined && part.ETag) {
          parts.push({ partNumber: part.PartNumber, etag: part.ETag, sizeBytes: part.Size ?? 0 });
        }
      }
      if (!page.IsTruncated || !page.NextPartNumberMarker) {
        break;
      }
      marker = page.NextPartNumberMarker;
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly StoredPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
  }

  /** Taille de l'objet, ou `null` s'il n'existe pas. */
  async objectSize(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return head.ContentLength ?? 0;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body) {
      throw new Error(`Objet vide : ${key}`);
    }
    return Buffer.from(await object.Body.transformToByteArray());
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
