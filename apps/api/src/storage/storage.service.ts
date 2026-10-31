import { HeadBucketCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";

@Injectable()
export class StorageService {
  readonly bucket: string;
  /** Client pour les appels serveur → stockage (réseau interne). */
  readonly client: S3Client;
  /** Client réservé à la signature d'URL : l'hôte doit être celui que le navigateur atteint. */
  readonly publicClient: S3Client;

  constructor(config: ConfigService<Env, true>) {
    const base: S3ClientConfig = {
      region: config.get("S3_REGION", { infer: true }),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY", { infer: true }),
        secretAccessKey: config.get("S3_SECRET_KEY", { infer: true }),
      },
      // Sans cela, le SDK ajoute des en-têtes de checksum qui cassent les URL présignées.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    };
    this.bucket = config.get("S3_BUCKET", { infer: true });
    this.client = new S3Client({ ...base, endpoint: config.get("S3_ENDPOINT", { infer: true }) });
    this.publicClient = new S3Client({
      ...base,
      endpoint: config.get("S3_PUBLIC_ENDPOINT", { infer: true }),
    });
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
