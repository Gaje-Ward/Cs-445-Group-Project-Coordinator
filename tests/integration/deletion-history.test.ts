import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAdminService, AdminAccessError } from "@/lib/admin-service";
import { createFileService } from "@/lib/file-service";
import { createProjectService } from "@/lib/project-service";
import { FileStore } from "@/lib/file-store";
import { testDatabaseUrl } from "../../scripts/test-database";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const root = await mkdtemp(join(tmpdir(), "gpc-history-test-")),
  store = new FileStore(root);
const admin = createAdminService(db, store),
  files = createFileService(db, store),
  projects = createProjectService(db);
const users: string[] = [],
  projectIds: string[] = [];
beforeAll(async () => {
  for (const isAdmin of [true, false]) {
    const user = await db.user.create({
      data: {
        name: "History fixture",
        email: randomUUID() + "@example.com",
        passwordHash: "test-only",
        isAdmin,
      },
      select: { id: true },
    });
    users.push(user.id);
  }
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.deletionRecord.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
  await rm(root, { recursive: true, force: true });
});
async function project(name = "History project " + randomUUID()) {
  const p = await projects.create(users[1], { name });
  projectIds.push(p.id);
  return p.id;
}
it("keeps only file names and context after normal deletion, while removing content", async () => {
  const id = await project();
  const bytes = new TextEncoder().encode(
    "contents that should not be retained",
  );
  const file = await files.upload(users[1], id, "deleted-notes.txt", bytes);
  const record = await db.projectFile.findUniqueOrThrow({
    where: { id: file.id },
    select: { storageKey: true },
  });
  await files.remove(users[1], id, file.id);
  const result = await admin.history(users[0], { projectId: id });
  expect(result.total).toBe(1);
  expect(result.items[0]).toMatchObject({
    kind: "FILE",
    name: "deleted-notes.txt",
    projectName: expect.stringContaining("History project"),
  });
  expect(result.items[0]).not.toHaveProperty("data");
  expect(result.items[0]).not.toHaveProperty("storageKey");
  expect(result.items[0]).not.toHaveProperty("sourceId");
  expect(result.items[0].deletedAt).toBeInstanceOf(Date);
  expect(
    await db.projectFile.findUnique({ where: { id: file.id } }),
  ).toBeNull();
  await expect(access(store.path(record.storageKey!))).rejects.toThrow();
  await expect(admin.download(users[0], file.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(files.remove(users[1], id, file.id)).rejects.toMatchObject({
    status: 404,
  });
  expect((await admin.history(users[0], { projectId: id })).total).toBe(1);
});
it("records project and cascaded file names once, with project context preserved", async () => {
  const id = await project();
  const bytes = new TextEncoder().encode("saved data");
  for (const name of ["first.txt", "second.txt"])
    await files.upload(users[1], id, name, bytes);
  await db.projectFile.create({
    data: {
      projectId: id,
      name: "unfinished.zip",
      mediaType: "application/zip",
      size: 4,
      state: "PENDING",
      storageKey: randomUUID(),
    },
  });
  await db.project.delete({ where: { id } });
  const history = await admin.history(users[0], { projectId: id });
  expect(history.total).toBe(3);
  expect(history.items.filter((row) => row.kind === "PROJECT")).toHaveLength(1);
  expect(history.items.filter((row) => row.kind === "FILE")).toHaveLength(2);
  expect(
    history.items
      .filter((row) => row.kind === "FILE")
      .every((row) => row.projectName?.startsWith("History project")),
  ).toBe(true);
  expect(history.items.some((row) => row.name === "unfinished.zip")).toBe(
    false,
  );
  expect(await db.projectFile.count({ where: { projectId: id } })).toBe(0);
});
it("rolls back deletion history when a project deletion transaction rolls back", async () => {
  const id = await project();
  await expect(
    db.$transaction(async (tx) => {
      await tx.project.delete({ where: { id } });
      throw new Error("Rollback requested");
    }),
  ).rejects.toThrow("Rollback requested");
  expect(await db.project.count({ where: { id } })).toBe(1);
  expect((await admin.history(users[0], { projectId: id })).total).toBe(0);
});
it("does not record failed or abandoned pending uploads", async () => {
  const id = await project();
  await expect(
    files.upload(
      users[1],
      id,
      "invalid.pdf",
      new TextEncoder().encode("not a PDF"),
    ),
  ).rejects.toMatchObject({ status: 415 });
  const pending = await db.projectFile.create({
    data: {
      projectId: id,
      name: "abandoned.zip",
      mediaType: "application/zip",
      size: 4,
      state: "PENDING",
      storageKey: randomUUID(),
    },
  });
  await db.projectFile.delete({ where: { id: pending.id } });
  expect((await admin.history(users[0], { projectId: id })).total).toBe(0);
});
it("filters and paginates history while denying ordinary accounts", async () => {
  const id = await project();
  await db.projectFile.createMany({
    data: Array.from({ length: 26 }, (_, n) => ({
      projectId: id,
      name: "report-" + n + ".txt",
      mediaType: "text/plain",
      size: 1,
      data: new Uint8Array([65]),
    })),
  });
  await db.projectFile.deleteMany({ where: { projectId: id } });
  await db.project.delete({ where: { id } });
  await expect(
    admin.history(users[1], { projectId: id }),
  ).rejects.toBeInstanceOf(AdminAccessError);
  const first = await admin.history(users[0], {
    projectId: id,
    kind: "files",
    page: 1,
  });
  const second = await admin.history(users[0], {
    projectId: id,
    kind: "files",
    page: 2,
  });
  expect(first.total).toBe(26);
  expect(first.items).toHaveLength(25);
  expect(second.items).toHaveLength(1);
  expect(
    (await admin.history(users[0], { projectId: id, kind: "projects" })).total,
  ).toBe(1);
  expect(
    (await admin.history(users[0], { projectId: id, q: "report-25" })).total,
  ).toBe(1);
});
