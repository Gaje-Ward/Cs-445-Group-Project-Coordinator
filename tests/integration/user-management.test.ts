import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAdminService, AdminAccessError } from "@/lib/admin-service";
import { loadSessionUser } from "@/lib/session-user";
import { verifyPassword } from "@/lib/password";
import { createFileService } from "@/lib/file-service";
import { FileStore } from "@/lib/file-store";
import { testDatabaseUrl } from "../../scripts/test-database";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const admin = createAdminService(db);
const ids: string[] = [],
  projectIds: string[] = [];
const storageRoot = await mkdtemp(join(tmpdir(), "gpc-managed-user-test-"));
beforeAll(async () => {
  for (const isAdmin of [true, false, false]) {
    const user = await db.user.create({
      data: {
        name: "Managed user",
        email: randomUUID() + "@example.com",
        passwordHash: "preserve-this-hash",
        isAdmin,
      },
      select: { id: true },
    });
    ids.push(user.id);
  }
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.deletionRecord.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
});
it("denies ordinary users, rejects unexpected fields, and protects the acting administrator", async () => {
  await expect(
    admin.changeUser(ids[1], ids[2], { isAdmin: true }),
  ).rejects.toBeInstanceOf(AdminAccessError);
  for (const input of [
    {},
    { email: "changed@example.com" },
    { passwordHash: "replacement" },
    { sessionVersion: 100 },
    { name: "x" },
  ])
    await expect(admin.changeUser(ids[0], ids[1], input)).rejects.toThrow();
  await expect(
    admin.changeUser(ids[0], ids[0], { isActive: false }),
  ).rejects.toThrow(/own account/);
  await expect(
    admin.changeUser(ids[0], ids[0], { isAdmin: false }),
  ).rejects.toThrow(/own administrator/);
});
it("edits display names and roles without exposing or changing passwords", async () => {
  const result = await admin.changeUser(ids[0], ids[1], {
    name: "Updated display name",
    isAdmin: true,
  });
  expect(result).toMatchObject({ name: "Updated display name", isAdmin: true });
  expect(result).not.toHaveProperty("passwordHash");
  expect(result).not.toHaveProperty("sessionVersion");
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: ids[1] } })).passwordHash,
  ).toBe("preserve-this-hash");
  await admin.changeUser(ids[0], ids[1], { isAdmin: false });
  expect(await admin.allowed(ids[1])).toBe(false);
});
it("disables immediately and requires a new session after reactivation", async () => {
  expect(await loadSessionUser(db, ids[1], 0)).not.toBeNull();
  await admin.changeUser(ids[0], ids[1], { isActive: false });
  expect(await loadSessionUser(db, ids[1], 0)).toBeNull();
  await expect(
    admin.changeUser(ids[0], ids[1], { isAdmin: true }),
  ).rejects.toThrow(/Reactivate/);
  await admin.changeUser(ids[0], ids[1], { isActive: true });
  expect(await loadSessionUser(db, ids[1], 0)).toBeNull();
  expect(await loadSessionUser(db, ids[1], 2)).not.toBeNull();
  expect(await db.user.count({ where: { id: ids[1] } })).toBe(1);
});
it("resets passwords as hashes, revokes existing sessions, and rejects ordinary callers", async () => {
  const target = await db.user.findUniqueOrThrow({ where: { id: ids[1] } });
  await expect(
    admin.resetPassword(ids[1], ids[2], {
      password: "a long replacement passphrase",
    }),
  ).rejects.toBeInstanceOf(AdminAccessError);
  await expect(
    admin.resetPassword(ids[0], ids[1], { password: "short" }),
  ).rejects.toThrow();
  await admin.resetPassword(ids[0], ids[1], {
    password: "a long replacement passphrase",
  });
  const updated = await db.user.findUniqueOrThrow({ where: { id: ids[1] } });
  expect(updated.passwordHash).not.toBe("a long replacement passphrase");
  expect(
    await verifyPassword("a long replacement passphrase", updated.passwordHash),
  ).toBe(true);
  expect(updated.sessionVersion).toBe(target.sessionVersion + 1);
  expect(await loadSessionUser(db, ids[1], target.sessionVersion)).toBeNull();
});
it("requires exact deletion confirmation and preserves shared work when deleting a member", async () => {
  const target = await db.user.create({
    data: {
      name: "Delete fixture",
      email: randomUUID() + "@example.com",
      passwordHash: "test-only",
    },
  });
  ids.push(target.id);
  const project = await db.project.create({
    data: {
      name: "Preserved project",
      memberships: {
        create: [
          { userId: ids[0], role: "OWNER" },
          { userId: target.id, role: "MEMBER" },
        ],
      },
    },
  });
  projectIds.push(project.id);
  const task = await db.task.create({
    data: {
      projectId: project.id,
      title: "Preserved task",
      assigneeProjectId: project.id,
      assigneeId: target.id,
    },
  });
  const file = await db.projectFile.create({
    data: {
      projectId: project.id,
      uploaderId: target.id,
      name: "preserved.txt",
      mediaType: "text/plain",
      size: 1,
      data: new Uint8Array([65]),
    },
  });
  await expect(
    admin.deleteUser(ids[1], target.id, { confirmationEmail: target.email }),
  ).rejects.toBeInstanceOf(AdminAccessError);
  await expect(
    admin.deleteUser(ids[0], target.id, {
      confirmationEmail: "wrong@example.com",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await admin.deleteUser(ids[0], target.id, {
    confirmationEmail: target.email,
  });
  expect(await db.user.findUnique({ where: { id: target.id } })).toBeNull();
  expect(await loadSessionUser(db, target.id, 0)).toBeNull();
  expect(await db.project.count({ where: { id: project.id } })).toBe(1);
  expect(
    (await db.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId,
  ).toBeNull();
  expect(
    (await db.projectFile.findUniqueOrThrow({ where: { id: file.id } }))
      .uploaderId,
  ).toBeNull();
});
it("blocks self-deletion and deletion of accounts that still own projects", async () => {
  const actor = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  await expect(
    admin.deleteUser(ids[0], ids[0], { confirmationEmail: actor.email }),
  ).rejects.toThrow(/own administrator/);
  const target = await db.user.findUniqueOrThrow({ where: { id: ids[1] } });
  const project = await db.project.create({
    data: {
      name: "Owned project",
      memberships: { create: { userId: target.id, role: "OWNER" } },
    },
  });
  projectIds.push(project.id);
  await expect(
    admin.deleteUser(ids[0], target.id, { confirmationEmail: target.email }),
  ).rejects.toThrow(/Transfer/);
  expect(await db.user.count({ where: { id: target.id } })).toBe(1);
});
it("transfers owned projects before deleting an owner and rejects stale confirmation counts", async () => {
  const target = await db.user.findUniqueOrThrow({ where: { id: ids[1] } });
  const owned = await db.projectMember.findMany({
    where: { userId: target.id, role: "OWNER" },
    select: { projectId: true },
  });
  expect(owned).toHaveLength(1);
  const projectId = owned[0].projectId;
  const file = await db.projectFile.create({
    data: {
      projectId,
      uploaderId: target.id,
      name: "kept-owned.txt",
      mediaType: "text/plain",
      size: 1,
      data: new Uint8Array([65]),
    },
  });
  await expect(
    admin.deleteUser(ids[0], target.id, {
      confirmationEmail: target.email,
      transferOwnedProjects: true,
      expectedOwnedProjectCount: 0,
    }),
  ).rejects.toThrow(/changed/);
  expect(await db.user.count({ where: { id: target.id } })).toBe(1);
  await admin.deleteUser(ids[0], target.id, {
    confirmationEmail: target.email,
    transferOwnedProjects: true,
    expectedOwnedProjectCount: 1,
  });
  expect(await db.user.count({ where: { id: target.id } })).toBe(0);
  expect(
    (
      await db.projectMember.findUniqueOrThrow({
        where: { projectId_userId: { projectId, userId: ids[0] } },
      })
    ).role,
  ).toBe("OWNER");
  expect(await db.project.count({ where: { id: projectId } })).toBe(1);
  expect(
    (await db.projectFile.findUniqueOrThrow({ where: { id: file.id } }))
      .uploaderId,
  ).toBeNull();
});
it("cannot delete a new owner concurrently with creating an unreviewed project", async () => {
  const target = await db.user.create({
    data: {
      name: "Concurrent owner",
      email: randomUUID() + "@example.com",
      passwordHash: "test-only",
    },
  });
  ids.push(target.id);
  const results = await Promise.allSettled([
    admin.deleteUser(ids[0], target.id, { confirmationEmail: target.email }),
    db.project.create({
      data: {
        name: "Concurrent project",
        memberships: { create: { userId: target.id, role: "OWNER" } },
      },
    }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const created = results[1];
  if (created.status === "fulfilled") {
    projectIds.push(created.value.id);
    expect(await db.user.count({ where: { id: target.id } })).toBe(1);
  }
});
it("removes unfinished uploads when their owner's account is deleted during transfer", async () => {
  const target = await db.user.create({
    data: {
      name: "Uploading owner",
      email: randomUUID() + "@example.com",
      passwordHash: "test-only",
    },
  });
  ids.push(target.id);
  const project = await db.project.create({
    data: {
      name: "Transferred upload project",
      memberships: { create: { userId: target.id, role: "OWNER" } },
    },
  });
  projectIds.push(project.id);
  const files = createFileService(db, new FileStore(storageRoot));
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const pending = files.uploadStream(
    target.id,
    project.id,
    "unfinished.zip",
    4,
    body,
  );
  const failed = expect(pending).rejects.toThrow("Project not found");
  await vi.waitFor(async () =>
    expect(
      await db.projectFile.count({
        where: { projectId: project.id, state: "PENDING" },
      }),
    ).toBe(1),
  );
  await admin.deleteUser(ids[0], target.id, {
    confirmationEmail: target.email,
    transferOwnedProjects: true,
    expectedOwnedProjectCount: 1,
  });
  controller.enqueue(new Uint8Array([80, 75, 3, 4]));
  controller.close();
  await failed;
  expect(await db.projectFile.count({ where: { projectId: project.id } })).toBe(
    0,
  );
  expect(await db.user.count({ where: { id: target.id } })).toBe(0);
});
it("serializes competing administrator changes so an authorized administrator remains", async () => {
  await admin.changeUser(ids[0], ids[2], { isAdmin: true });
  const results = await Promise.allSettled([
    admin.changeUser(ids[0], ids[2], { isAdmin: false }),
    admin.changeUser(ids[2], ids[0], { isAdmin: false }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.user.count({
      where: { id: { in: [ids[0], ids[2]] }, isAdmin: true, isActive: true },
    }),
  ).toBe(1);
});
