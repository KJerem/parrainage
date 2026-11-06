-- AlterEnum
BEGIN;
CREATE TYPE "AlertType_new" AS ENUM ('PHONE', 'EMAIL', 'URL', 'SOCIAL', 'ADDRESS', 'MONEY', 'MEETING');
ALTER TABLE "public"."Message" ALTER COLUMN "alertTypes" DROP DEFAULT;
ALTER TABLE "Message" ALTER COLUMN "alertTypes" TYPE "AlertType_new"[] USING ("alertTypes"::text::"AlertType_new"[]);
ALTER TYPE "AlertType" RENAME TO "AlertType_old";
ALTER TYPE "AlertType_new" RENAME TO "AlertType";
DROP TYPE "public"."AlertType_old";
ALTER TABLE "Message" ALTER COLUMN "alertTypes" SET DEFAULT ARRAY[]::"AlertType"[];
COMMIT;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "uploadId" TEXT;

