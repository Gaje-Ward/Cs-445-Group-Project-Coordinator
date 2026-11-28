import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createAdminService,
  AdminAccessError,
  ADMIN_PAGE_SIZE,
} from "@/lib/admin-service";
import { createFileService } from "@/lib/file-service";
import { createProjectService } from "@/lib/project-service";
import { FileStore } from "@/lib/file-store";
import { registrationSchema } from "@/lib/validation";
import { testDatabaseUrl } from "../../scripts/test-database";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const root = await mkdtemp(join(tmpdir(), "gpc-admin-test-"));
const store = new FileStore(root);
const admin = createAdminService(db, store),
  files = createFileService(db, store),
  projects = createProjectService(db);
const marker = "Admin fixture " + randomUUID();
const ids: string[] = [],
  projectIds: string[] = [];
let administrator: string, owner: string, projectId: string, fileId: string;
const bytes = new TextEncoder().encode("private project document");
beforeAll(async () => {
  for (const isAdmin of [true, false]) {
    const user = await db.user.create({
      data: {
        name: marker + (isAdmin ? " admin" : " owner"),
        email: randomUUID() + "@example.com",
        passwordHash: "test-only-never-expose",
        isAdmin,
      },
    });
    ids.push(user.id);
  }
  [administrator, owner] = ids;
  const project = await projects.create(owner, {
    name: marker,
    description: "Visible only through authorized admin views",
  });
  projectId = project.id;
  projectIds.push(projectId);
  const file = await files.upload(owner, projectId, "admin-private.txt", bytes);
  fileId = file.id;
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.deletionRecord.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
  await rm(root, { recursive: true, force: true });
});
it("requires current administrator permission for every cross-project operation", async () => {
  for (const attempt of [
    () => admin.overview(owner),
    () => admin.users(owner),
    () => admin.projects(owner),
    () => admin.files(owner),
    () => admin.download(owner, fileId),
  ])
    await expect(attempt()).rejects.toBeInstanceOf(AdminAccessError);
  expect(await admin.allowed("missing-user")).toBe(false);
  expect(await projects.list(administrator)).toEqual([]);
  await expect(
    files.download(administrator, projectId, fileId),
  ).rejects.toMatchObject({ status: 404 });
});
it("lists safe account, project, and file metadata with search and project filtering", async () => {
  const userRows = await admin.users(administrator, { q: marker });
  expect(userRows.total).toBe(2);
  expect(userRows.items.every((item) => !("passwordHash" in item))).toBe(true);
  const projectRows = await admin.projects(administrator, { q: marker });
  expect(projectRows.total).toBe(1);
  expect(projectRows.items[0]._count.files).toBe(1);
  expect(projectRows.items[0].memberships[0].user).not.toHaveProperty(
    "passwordHash",
  );
  const fileRows = await admin.files(administrator, {
    projectId,
    q: "admin-private",
  });
  expect(fileRows.total).toBe(1);
  expect(fileRows.items[0]).toMatchObject({
    name: "admin-private.txt",
    state: "READY",
    project: { id: projectId },
  });
  expect(fileRows.items[0]).not.toHaveProperty("data");
  expect(fileRows.items[0]).not.toHaveProperty("storageKey");
  const overview = await admin.overview(administrator);
  expect(overview.counts.users).toBeGreaterThanOrEqual(2);
  expect(overview.counts.files).toBeGreaterThanOrEqual(1);
  const download = await admin.download(administrator, fileId);
  expect(
    await new Response(
      download.body instanceof Uint8Array
        ? new Uint8Array(download.body)
        : download.body,
    ).text(),
  ).toBe("private project document");
});
it("paginates accounts without exposing password fields", async () => {
  const prefix = "Pagination " + randomUUID();
  for (let n = 0; n < ADMIN_PAGE_SIZE + 1; n++) {
    const user = await db.user.create({
      data: {
        name: prefix,
        email: randomUUID() + "@example.com",
        passwordHash: "must-stay-private",
      },
      select: { id: true, isAdmin: true },
    });
    ids.push(user.id);
    expect(user.isAdmin).toBe(false);
  }
  const first = await admin.users(administrator, { q: prefix, page: 1 });
  const second = await admin.users(administrator, { q: prefix, page: 2 });
  expect(first.items).toHaveLength(ADMIN_PAGE_SIZE);
  expect(second.items).toHaveLength(1);
  expect(new Set([...first.items, ...second.items].map((u) => u.id)).size).toBe(
    ADMIN_PAGE_SIZE + 1,
  );
});
it("honors grants and revocations immediately without trusting caller role fields", async () => {
  await db.user.update({ where: { id: owner }, data: { isAdmin: true } });
  expect(await admin.allowed(owner)).toBe(true);
  expect((await admin.users(owner, { q: marker })).total).toBe(2);
  await db.user.update({ where: { id: owner }, data: { isAdmin: false } });
  await expect(admin.users(owner)).rejects.toBeInstanceOf(AdminAccessError);
  await expect(admin.download(owner, fileId)).rejects.toBeInstanceOf(
    AdminAccessError,
  );
  expect(
    registrationSchema.safeParse({
      name: "Applicant",
      email: "new@example.com",
      password: "a long registration password",
      isAdmin: true,
    }).success,
  ).toBe(false);
});
