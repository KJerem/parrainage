import { S3Client } from "@aws-sdk/client-s3";

export interface S3Settings {
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint: string;
}

/** Client S3 (RustFS en local), partagé avec le seed qui tourne hors de Nest. */
export function createS3Client(settings: S3Settings): S3Client {
  return new S3Client({
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey },
    // Sans cela, le SDK ajoute des en-têtes de checksum qui cassent les URL présignées.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
