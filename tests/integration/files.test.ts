import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createFileService, cleanFileStorage } from "@/lib/file-service";
import { createProjectService } from "@/lib/project-service";
import { createMemberService } from "@/lib/member-service";
import { FileStore } from "@/lib/file-store";
import { mkdtemp, rm, access, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testDatabaseUrl } from "../../scripts/test-database";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const storageRoot = await mkdtemp(join(tmpdir(), "gpc-file-test-"));
const store = new FileStore(storageRoot);
const files = createFileService(db, store);
async function saved(projectId: string, id: string) {
  const file = await files.download(users[0].id, projectId, id);
  return new Uint8Array(
    await new Response(
      file.body instanceof Uint8Array ? new Uint8Array(file.body) : file.body,
    ).arrayBuffer(),
  );
}
const projects = createProjectService(db);
const members = createMemberService(db);
const users: { id: string; email: string }[] = [];
const projectIds: string[] = [];
const bytes = new TextEncoder().encode("Team project notes\n");
beforeAll(async () => {
  for (const name of ["File owner", "File member", "File outsider"])
    users.push(
      await db.user.create({
        data: {
          name,
          email: randomUUID() + "@example.com",
          passwordHash: "test-only",
        },
        select: { id: true, email: true },
      }),
    );
});

async function project() {
  const p = await projects.create(users[0].id, { name: "File project" });
  projectIds.push(p.id);
  await members.add(users[0].id, p.id, { email: users[1].email });
  return p.id;
}
it("stores exact bytes, lists metadata only, and enforces project access on every operation", async () => {
  const id = await project();
  const other = await project();
  const file = await files.upload(users[1].id, id, "notes.txt", bytes);
  expect(file).not.toHaveProperty("data");
  const list = await files.list(users[0].id, id);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({
    name: "notes.txt",
    size: bytes.length,
    uploaderName: "File member",
  });
  expect(list[0]).not.toHaveProperty("data");
  expect(await saved(id, file.id)).toEqual(bytes);
  await expect(
    files.download(users[0].id, other, file.id),
  ).rejects.toMatchObject({ status: 404 });
  await expect(files.list(users[2].id, id)).rejects.toThrow(
    "Project not found",
  );
  await expect(
    files.upload(users[2].id, id, "hidden.txt", bytes),
  ).rejects.toThrow("Project not found");
  await expect(files.download(users[2].id, id, file.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(files.remove(users[2].id, id, file.id)).rejects.toMatchObject({
    status: 404,
  });
  await members.remove(users[0].id, id, { userId: users[1].id });
  await expect(files.download(users[1].id, id, file.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(files.remove(users[1].id, id, file.id)).rejects.toMatchObject({
    status: 404,
  });
  expect(await saved(id, file.id)).toEqual(bytes);
});
it("allows deletion by the uploader or owner but not another member", async () => {
  const id = await project();
  const owned = await files.upload(users[0].id, id, "owner.txt", bytes);
  await expect(files.remove(users[1].id, id, owned.id)).rejects.toMatchObject({
    status: 404,
  });
  const own = await files.upload(users[1].id, id, "member.txt", bytes);
  await files.remove(users[1].id, id, own.id);
  await expect(files.download(users[0].id, id, own.id)).rejects.toMatchObject({
    status: 404,
  });
  const second = await files.upload(users[1].id, id, "member.txt", bytes);
  await files.remove(users[0].id, id, second.id);
  await files.remove(users[0].id, id, owned.id);
  expect(await files.list(users[0].id, id)).toEqual([]);
});
it("rejects invalid uploads without saving metadata and cascades project file deletion", async () => {
  const id = await project();
  await expect(
    files.upload(users[0].id, id, "fake.pdf", bytes),
  ).rejects.toMatchObject({ status: 415 });
  expect(await files.list(users[0].id, id)).toEqual([]);
  const file = await files.upload(users[0].id, id, "notes.txt", bytes);
  await db.project.delete({ where: { id } });
  expect(
    await db.projectFile.findUnique({ where: { id: file.id } }),
  ).toBeNull();
});
it("serializes concurrent uploads at the project file-count quota", async () => {
  const id = await project();
  await db.projectFile.createMany({
    data: Array.from({ length: 99 }, () => ({
      id: randomUUID(),
      projectId: id,
      uploaderId: users[0].id,
      name: "seed.txt",
      mediaType: "text/plain",
      size: bytes.length,
      data: bytes,
    })),
  });
  const results = await Promise.allSettled([
    files.upload(users[0].id, id, "last.txt", bytes),
    files.upload(users[1].id, id, "extra.txt", bytes),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(await db.projectFile.count({ where: { projectId: id } })).toBe(100);
});
it("preserves shared files after an uploader account is removed", async () => {
  const id = await project();
  const user = await db.user.create({
    data: {
      name: "Former uploader",
      email: randomUUID() + "@example.com",
      passwordHash: "test-only",
    },
    select: { id: true, email: true },
  });
  users.push(user);
  await members.add(users[0].id, id, { email: user.email });
  const file = await files.upload(user.id, id, "kept.txt", bytes);
  await members.remove(users[0].id, id, { userId: user.id });
  await db.user.delete({ where: { id: user.id } });
  expect((await files.list(users[0].id, id))[0]).toMatchObject({
    uploaderId: null,
    uploaderName: "Former user",
  });
  expect(await saved(id, file.id)).toEqual(bytes);
  await files.remove(users[0].id, id, file.id);
});
it("enforces stored byte lengths even for writes outside the upload service", async () => {
  const id = await project();
  await expect(
    db.projectFile.create({
      data: {
        projectId: id,
        name: "bad.txt",
        mediaType: "text/plain",
        size: bytes.length + 1,
        data: bytes,
      },
    }),
  ).rejects.toThrow();
  expect(await files.list(users[0].id, id)).toEqual([]);
});
it("keeps legacy database uploads readable alongside new disk files", async () => {
  const id = await project();
  const legacy = await db.projectFile.create({
    data: {
      projectId: id,
      name: "legacy.txt",
      mediaType: "text/plain",
      size: bytes.length,
      data: bytes,
    },
  });
  expect(await saved(id, legacy.id)).toEqual(bytes);
  const fresh = await files.upload(users[0].id, id, "new.txt", bytes);
  expect(
    await db.projectFile.findUnique({
      where: { id: fresh.id },
      select: { data: true, storageKey: true, state: true },
    }),
  ).toMatchObject({
    data: null,
    storageKey: expect.any(String),
    state: "READY",
  });
});
it("counts a full 2 GiB of reservations without buffering file data", async () => {
  const id = await project();
  await db.projectFile.createMany({
    data: Array.from({ length: 4 }, () => ({
      projectId: id,
      name: "reserved.zip",
      mediaType: "application/zip",
      size: 512 * 1024 * 1024,
      storageKey: randomUUID(),
      state: "PENDING" as const,
    })),
  });
  await expect(
    files.upload(users[0].id, id, "extra.txt", bytes),
  ).rejects.toMatchObject({ status: 409 });
  expect(await files.list(users[0].id, id)).toEqual([]);
});
it("bounds simultaneous active streams and cancels them without leaking quota", async () => {
  const id = await project();
  const controllers = [new AbortController(), new AbortController()];
  const waiting = controllers.map((controller, index) =>
    files.uploadStream(
      users[0].id,
      id,
      "waiting-" + index + ".zip",
      4,
      new ReadableStream<Uint8Array>(),
      controller.signal,
    ),
  );
  const settled = Promise.allSettled(waiting);
  await vi.waitFor(async () =>
    expect(
      await db.projectFile.count({
        where: { projectId: id, state: "PENDING" },
      }),
    ).toBe(2),
  );
  await expect(
    files.upload(users[0].id, id, "third.txt", bytes),
  ).rejects.toMatchObject({ status: 429 });
  controllers.forEach((c) => c.abort());
  expect((await settled).every((r) => r.status === "rejected")).toBe(true);
  expect(await db.projectFile.count({ where: { projectId: id } })).toBe(0);
});
it("cleans interrupted uploads and releases reservations", async () => {
  const id = await project();
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([80, 75, 3, 4]));
    },
  });
  const pending = files.uploadStream(
    users[0].id,
    id,
    "interrupted.zip",
    100,
    body,
    abort.signal,
  );
  const failed = expect(pending).rejects.toMatchObject({ status: 408 });
  let key = "";
  await vi.waitFor(async () => {
    const row = await db.projectFile.findFirst({
      where: { projectId: id, state: "PENDING" },
    });
    expect(row).not.toBeNull();
    key = row!.storageKey!;
  });
  expect(await files.list(users[0].id, id)).toEqual([]);
  abort.abort();
  await failed;
  expect(await db.projectFile.count({ where: { projectId: id } })).toBe(0);
  await expect(access(store.path(key))).rejects.toThrow();
  await expect(access(store.path(key, true))).rejects.toThrow();
  await files.upload(users[0].id, id, "retry.txt", bytes);
});
it("rejects inaccurate sizes and membership removal during an upload without leaving files", async () => {
  const id = await project();
  const short = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  await expect(
    files.uploadStream(users[0].id, id, "short.txt", bytes.length + 1, short),
  ).rejects.toThrow(/incomplete/);
  expect(await db.projectFile.count({ where: { projectId: id } })).toBe(0);
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const pending = files.uploadStream(users[1].id, id, "removed.zip", 4, body);
  const failed = expect(pending).rejects.toThrow("Project not found");
  await vi.waitFor(async () =>
    expect(
      await db.projectFile.count({
        where: { projectId: id, state: "PENDING" },
      }),
    ).toBe(1),
  );
  await members.remove(users[0].id, id, { userId: users[1].id });
  controller.enqueue(new Uint8Array([80, 75, 3, 4]));
  controller.close();
  await failed;
  expect(await db.projectFile.count({ where: { projectId: id } })).toBe(0);
});
it("recovers stale partial files and orphans while preserving ready uploads", async () => {
  const id = await project();
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const ready = await files.upload(users[0].id, id, "keep.txt", bytes);
  const readyRow = await db.projectFile.findUniqueOrThrow({
    where: { id: ready.id },
  });
  await utimes(store.path(readyRow.storageKey!), old, old);
  const key = randomUUID(),
    orphan = randomUUID();
  await db.projectFile.create({
    data: {
      projectId: id,
      name: "stale.zip",
      mediaType: "application/zip",
      size: 4,
      storageKey: key,
      state: "PENDING",
      createdAt: old,
    },
  });
  await writeFile(store.path(key, true), "partial");
  await utimes(store.path(key, true), old, old);
  await writeFile(store.path(orphan), "orphan");
  await utimes(store.path(orphan), old, old);
  const preview = await cleanFileStorage(db, store);
  expect(preview.records).toBeGreaterThan(0);
  expect(preview.orphans).toBeGreaterThan(0);
  await access(store.path(key, true));
  await access(store.path(orphan));
  await cleanFileStorage(db, store, true);
  await expect(access(store.path(key, true))).rejects.toThrow();
  await expect(access(store.path(orphan))).rejects.toThrow();
  expect(await saved(id, ready.id)).toEqual(bytes);
});
it("serializes concurrent reservations at the byte quota and frees space after deletion", async () => {
  const id = await project();
  const quota = bytes.length * 2;
  const limited = createFileService(db, store, quota);
  const seed = await limited.upload(users[0].id, id, "seed.txt", bytes);
  const results = await Promise.allSettled([
    limited.upload(users[0].id, id, "last.txt", bytes),
    limited.upload(users[1].id, id, "extra.txt", bytes),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await db.projectFile.aggregate({
        where: { projectId: id },
        _sum: { size: true },
      })
    )._sum.size,
  ).toBe(quota);
  await limited.remove(users[0].id, id, seed.id);
  await limited.upload(users[0].id, id, "replacement.txt", bytes);
});
