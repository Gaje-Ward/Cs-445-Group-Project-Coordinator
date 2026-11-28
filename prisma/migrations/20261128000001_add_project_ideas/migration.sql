CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Idea_title_check" CHECK (char_length(btrim("title")) >= 2),
    CONSTRAINT "Idea_body_check" CHECK (char_length(btrim("body")) > 0)
);
CREATE UNIQUE INDEX "Idea_projectId_id_key" ON "Idea"("projectId", "id");
CREATE INDEX "Idea_projectId_createdAt_id_idx" ON "Idea"("projectId", "createdAt", "id");
CREATE INDEX "Idea_authorId_idx" ON "Idea"("authorId");
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IdeaVote" (
    "projectId" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "IdeaVote_pkey" PRIMARY KEY ("ideaId", "userId")
);
CREATE INDEX "IdeaVote_projectId_userId_idx" ON "IdeaVote"("projectId", "userId");
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_projectId_ideaId_fkey" FOREIGN KEY ("projectId", "ideaId") REFERENCES "Idea"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaVote" ADD CONSTRAINT "IdeaVote_projectId_userId_fkey" FOREIGN KEY ("projectId", "userId") REFERENCES "ProjectMember"("projectId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
