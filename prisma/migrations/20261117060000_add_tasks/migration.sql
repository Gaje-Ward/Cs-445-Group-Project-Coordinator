CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(4000),
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" DATE,
    "assigneeProjectId" TEXT,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Task_assignee_same_project_check" CHECK (
      ("assigneeId" IS NULL AND "assigneeProjectId" IS NULL) OR
      ("assigneeId" IS NOT NULL AND "assigneeProjectId" IS NOT NULL AND "assigneeProjectId" = "projectId")
    )
);

CREATE INDEX "Task_projectId_status_dueDate_idx" ON "Task"("projectId", "status", "dueDate");
CREATE INDEX "Task_assigneeProjectId_assigneeId_idx" ON "Task"("assigneeProjectId", "assigneeId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeProjectId_assigneeId_fkey" FOREIGN KEY ("assigneeProjectId", "assigneeId") REFERENCES "ProjectMember"("projectId", "userId") ON DELETE SET NULL ON UPDATE CASCADE;
