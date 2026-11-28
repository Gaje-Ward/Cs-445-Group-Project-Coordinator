CREATE TYPE "FileState" AS ENUM ('PENDING', 'READY', 'DELETING');
ALTER TABLE "ProjectFile" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "ProjectFile" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "ProjectFile" ADD COLUMN "state" "FileState" NOT NULL DEFAULT 'READY';
ALTER TABLE "ProjectFile" DROP CONSTRAINT "ProjectFile_size_check";
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_size_check" CHECK (
  "size" > 0 AND "size" <= 536870912 AND (
    ("storageKey" IS NOT NULL AND "data" IS NULL) OR
    ("storageKey" IS NULL AND "data" IS NOT NULL AND "state" <> 'PENDING' AND "size" <= 5242880 AND "size" = octet_length("data"))
  )
);
CREATE UNIQUE INDEX "ProjectFile_storageKey_key" ON "ProjectFile"("storageKey");
