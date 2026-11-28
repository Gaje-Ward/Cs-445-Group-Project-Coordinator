CREATE TYPE "DeletedKind" AS ENUM ('PROJECT', 'FILE');
CREATE TABLE "DeletionRecord" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "kind" "DeletedKind" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" VARCHAR(120),
    "deletedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletionRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeletionRecord_kind_sourceId_key" ON "DeletionRecord"("kind", "sourceId");
CREATE INDEX "DeletionRecord_deletedAt_id_idx" ON "DeletionRecord"("deletedAt", "id");

CREATE FUNCTION record_project_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public."DeletionRecord" ("kind", "sourceId", "name", "projectId")
    VALUES ('PROJECT', OLD."id", OLD."name", OLD."id")
    ON CONFLICT ("kind", "sourceId") DO NOTHING;

    -- Snapshot names before the project and its files cascade away.
    INSERT INTO public."DeletionRecord" ("kind", "sourceId", "name", "projectId", "projectName")
    SELECT 'FILE', f."id", f."name", OLD."id", OLD."name"
    FROM public."ProjectFile" f
    WHERE f."projectId" = OLD."id" AND f."state" IN ('READY', 'DELETING')
    ON CONFLICT ("kind", "sourceId") DO NOTHING;
    RETURN OLD;
END;
$$;

CREATE FUNCTION record_file_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Unfinished uploads were never shared; recovery should not create history for them.
    IF OLD."state" IN ('READY', 'DELETING') THEN
        INSERT INTO public."DeletionRecord" ("kind", "sourceId", "name", "projectId", "projectName")
        VALUES ('FILE', OLD."id", OLD."name", OLD."projectId",
            (SELECT p."name" FROM public."Project" p WHERE p."id" = OLD."projectId"))
        ON CONFLICT ("kind", "sourceId") DO NOTHING;
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER "Project_deletion_history" BEFORE DELETE ON "Project"
FOR EACH ROW EXECUTE FUNCTION record_project_deletion();
CREATE TRIGGER "ProjectFile_deletion_history" AFTER DELETE ON "ProjectFile"
FOR EACH ROW EXECUTE FUNCTION record_file_deletion();
