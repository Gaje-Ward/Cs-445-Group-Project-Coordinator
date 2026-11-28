import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createCommentService,
  CommentConflictError,
  CommentNotFoundError,
} from "@/lib/comment-service";
import { createProjectService } from "@/lib/project-service";
import { createMemberService } from "@/lib/member-service";
import { createAdminService } from "@/lib/admin-service";
import { testDatabaseUrl } from "../../scripts/test-database";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const comments = createCommentService(db),
  projects = createProjectService(db),
  members = createMemberService(db),
  admin = createAdminService(db);
const users: { id: string; email: string }[] = [],
  projectIds: string[] = [];
beforeAll(async () => {
  for (const [index, name] of [
    "Comment owner",
    "Comment author",
    "Comment peer",
    "Comment outsider",
  ].entries())
    users.push(
      await db.user.create({
        data: {
          name,
          email: randomUUID() + "@example.com",
          passwordHash: "private-test-only",
          isAdmin: index === 3,
        },
        select: { id: true, email: true },
      }),
    );
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.deletionRecord.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await db.user.deleteMany({
    where: { id: { in: users.map((user) => user.id) } },
  });
  await db.$disconnect();
});
async function project() {
  const p = await projects.create(users[0].id, {
    name: "Comment project " + randomUUID(),
  });
  projectIds.push(p.id);
  for (const user of users.slice(1, 3))
    await members.add(users[0].id, p.id, { email: user.email });
  return p.id;
}
it("creates server-authored comments and returns only safe author details", async () => {
  const id = await project();
  const posted = await comments.create(users[1].id, id, {
    body: "  Discuss the next step\nKeep this note.  ",
  });
  expect(posted).toMatchObject({
    body: "Discuss the next step\nKeep this note.",
    authorId: users[1].id,
    authorName: "Comment author",
    version: 0,
  });
  expect(posted.createdAt).toBeInstanceOf(Date);
  expect(posted).not.toHaveProperty("author");
  expect(posted).not.toHaveProperty("email");
  expect(posted).not.toHaveProperty("passwordHash");
  const list = await comments.list(users[2].id, id);
  expect(list.total).toBe(1);
  expect(list.items[0].id).toBe(posted.id);
});
it("requires project membership even for a site administrator and rejects wrong-project comment IDs", async () => {
  const id = await project(),
    other = await project();
  const posted = await comments.create(users[1].id, id, {
    body: "Private discussion",
  });
  await expect(comments.list(users[3].id, id)).rejects.toThrow(
    "Project not found",
  );
  await expect(
    comments.create(users[3].id, id, { body: "Intrusion" }),
  ).rejects.toThrow("Project not found");
  await expect(
    comments.edit(users[3].id, id, posted.id, { body: "Changed", version: 0 }),
  ).rejects.toThrow("Project not found");
  await expect(
    comments.remove(users[3].id, id, posted.id, { version: 0 }),
  ).rejects.toThrow("Project not found");
  await expect(
    comments.edit(users[1].id, other, posted.id, {
      body: "Wrong project",
      version: 0,
    }),
  ).rejects.toBeInstanceOf(CommentNotFoundError);
  await expect(
    comments.remove(users[0].id, other, posted.id, { version: 0 }),
  ).rejects.toBeInstanceOf(CommentNotFoundError);
  expect((await comments.list(users[1].id, id)).items[0].body).toBe(
    "Private discussion",
  );
});
it("limits editing to authors and allows authors or project owners to delete", async () => {
  const id = await project();
  const posted = await comments.create(users[1].id, id, { body: "Original" });
  await expect(
    comments.edit(users[0].id, id, posted.id, {
      body: "Owner overwrite",
      version: 0,
    }),
  ).rejects.toBeInstanceOf(CommentNotFoundError);
  await expect(
    comments.remove(users[2].id, id, posted.id, { version: 0 }),
  ).rejects.toBeInstanceOf(CommentNotFoundError);
  const edited = await comments.edit(users[1].id, id, posted.id, {
    body: "Edited by author",
    version: 0,
  });
  expect(edited.version).toBe(1);
  expect(edited.createdAt).toEqual(posted.createdAt);
  await expect(
    comments.remove(users[0].id, id, posted.id, { version: 0 }),
  ).rejects.toBeInstanceOf(CommentConflictError);
  await comments.remove(users[0].id, id, posted.id, { version: 1 });
  expect((await comments.list(users[1].id, id)).total).toBe(0);
  const own = await comments.create(users[1].id, id, {
    body: "Author can remove",
  });
  await comments.remove(users[1].id, id, own.id, { version: 0 });
});
it("prevents simultaneous stale edits from overwriting one another", async () => {
  const id = await project();
  const posted = await comments.create(users[1].id, id, { body: "Original" });
  const results = await Promise.allSettled([
    comments.edit(users[1].id, id, posted.id, {
      body: "First edit",
      version: 0,
    }),
    comments.edit(users[1].id, id, posted.id, {
      body: "Second edit",
      version: 0,
    }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const failed = results.find((result) => result.status === "rejected");
  expect(
    failed?.status === "rejected" &&
      failed.reason instanceof CommentConflictError,
  ).toBe(true);
  expect((await comments.list(users[1].id, id)).items[0].version).toBe(1);
});
it("revokes removed or disabled members while preserving their comments", async () => {
  const id = await project();
  const posted = await comments.create(users[1].id, id, {
    body: "Retained note",
  });
  await members.remove(users[0].id, id, { userId: users[1].id });
  await expect(comments.list(users[1].id, id)).rejects.toThrow(
    "Project not found",
  );
  await expect(
    comments.edit(users[1].id, id, posted.id, {
      body: "After removal",
      version: 0,
    }),
  ).rejects.toThrow("Project not found");
  await expect(
    comments.remove(users[1].id, id, posted.id, { version: 0 }),
  ).rejects.toThrow("Project not found");
  expect((await comments.list(users[0].id, id)).items[0].body).toBe(
    "Retained note",
  );
  await members.add(users[0].id, id, { email: users[1].email });
  await db.user.update({
    where: { id: users[1].id },
    data: { isActive: false },
  });
  try {
    await expect(
      comments.create(users[1].id, id, { body: "Disabled" }),
    ).rejects.toThrow("Project not found");
  } finally {
    await db.user.update({
      where: { id: users[1].id },
      data: { isActive: true },
    });
  }
});
it("retains discussion with a former-user label after permanent account deletion", async () => {
  const id = await project();
  const author = await db.user.create({
    data: {
      name: "Departed author",
      email: randomUUID() + "@example.com",
      passwordHash: "test-only",
    },
    select: { id: true, email: true },
  });
  users.push(author);
  await members.add(users[0].id, id, { email: author.email });
  const posted = await comments.create(author.id, id, {
    body: "Keep this decision",
  });
  await admin.deleteUser(users[3].id, author.id, {
    confirmationEmail: author.email,
  });
  const kept = (await comments.list(users[0].id, id)).items[0];
  expect(kept).toMatchObject({
    id: posted.id,
    body: "Keep this decision",
    authorId: null,
    authorName: "Former user",
  });
  await comments.remove(users[0].id, id, posted.id, { version: 0 });
});
it("paginates newest-first and clamps the last page after deletion", async () => {
  const id = await project();
  const rows = Array.from({ length: 26 }, (_, index) => ({
    id: randomUUID(),
    projectId: id,
    authorId: users[1].id,
    body: "Entry " + index,
    createdAt: new Date(index * 1000),
  }));
  await db.comment.createMany({ data: rows });
  const first = await comments.list(users[0].id, id, 1),
    second = await comments.list(users[0].id, id, 2);
  expect(first.items).toHaveLength(25);
  expect(second.items).toHaveLength(1);
  expect(first.items[0].body).toBe("Entry 25");
  expect(second.items[0].body).toBe("Entry 0");
  expect(
    new Set([...first.items, ...second.items].map((item) => item.id)).size,
  ).toBe(26);
  await comments.remove(users[1].id, id, second.items[0].id, { version: 0 });
  const clamped = await comments.list(users[0].id, id, 999);
  expect(clamped).toMatchObject({ page: 1, pageCount: 1, total: 25 });
  expect(clamped.items).toHaveLength(25);
});
it("cascades comment deletion with the project without retaining comment bodies in history", async () => {
  const id = await project();
  await comments.create(users[1].id, id, {
    body: "A project-specific decision",
  });
  await db.project.delete({ where: { id } });
  expect(await db.comment.count({ where: { projectId: id } })).toBe(0);
  const history = await db.deletionRecord.findMany({
    where: { projectId: id },
  });
  expect(history).toHaveLength(1);
  expect(history[0].kind).toBe("PROJECT");
});
