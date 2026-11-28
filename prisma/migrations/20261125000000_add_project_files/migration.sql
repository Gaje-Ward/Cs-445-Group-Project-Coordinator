CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "name" VARCHAR(180) NOT NULL,
    "mediaType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProjectFile_size_check" CHECK ("size" > 0 AND "size" <= 5242880 AND "size" = octet_length("data"))
);
CREATE INDEX "ProjectFile_projectId_createdAt_idx" ON "ProjectFile"("projectId", "createdAt");
CREATE INDEX "ProjectFile_uploaderId_idx" ON "ProjectFile"("uploaderId");
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
