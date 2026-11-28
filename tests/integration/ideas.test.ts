import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createIdeaService, IdeaNotFoundError } from "@/lib/idea-service";
import {
  createProjectService,
  ProjectNotFoundError,
} from "@/lib/project-service";
import { createMemberService } from "@/lib/member-service";
import { testDatabaseUrl } from "../../scripts/test-database";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const ideas = createIdeaService(db),
  projects = createProjectService(db),
  members = createMemberService(db);
const users: { id: string; email: string }[] = [],
  projectIds: string[] = [];
beforeAll(async () => {
  for (const [index, name] of [
    "Idea owner",
    "Idea author",
    "Idea peer",
    "Idea outsider",
  ].entries())
    users.push(
      await db.user.create({
        data: {
          name,
          email: randomUUID() + "@example.com",
          passwordHash: "test-only",
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
    name: "Ideas " + randomUUID(),
  });
  projectIds.push(p.id);
  for (const user of users.slice(1, 3))
    await members.add(users[0].id, p.id, { email: user.email });
  return p.id;
}
async function idea(projectId: string) {
  return ideas.create(users[1].id, projectId, {
    title: "Try a shared plan",
    body: "Explain the proposal.",
  });
}
it("records the session author and safe fields, with no automatic vote", async () => {
  const id = await project(),
    posted = await idea(id);
  expect(posted).toMatchObject({
    authorId: users[1].id,
    authorName: "Idea author",
    voteCount: 0,
    voted: false,
  });
  expect(posted).not.toHaveProperty("email");
  expect(posted).not.toHaveProperty("author");
  expect((await ideas.list(users[2].id, id)).items[0].id).toBe(posted.id);
});
it("enforces membership and project isolation for every action", async () => {
  const id = await project(),
    other = await project(),
    posted = await idea(id);
  for (const action of [
    () => ideas.list(users[3].id, id),
    () => ideas.create(users[3].id, id, { title: "No entry", body: "No" }),
    () => ideas.vote(users[3].id, id, posted.id, { voted: true }),
    () => ideas.remove(users[3].id, id, posted.id, {}),
  ])
    await expect(action()).rejects.toBeInstanceOf(ProjectNotFoundError);
  await expect(
    ideas.vote(users[1].id, other, posted.id, { voted: true }),
  ).rejects.toBeInstanceOf(IdeaNotFoundError);
  await expect(
    ideas.remove(users[0].id, other, posted.id, {}),
  ).rejects.toBeInstanceOf(IdeaNotFoundError);
  await expect(
    db.ideaVote.create({
      data: { projectId: other, ideaId: posted.id, userId: users[1].id },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  await expect(
    db.ideaVote.create({
      data: { projectId: id, ideaId: posted.id, userId: users[3].id },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
});
it("keeps one stored vote under retries and concurrent requests", async () => {
  const id = await project(),
    posted = await idea(id);
  await Promise.all(
    Array.from({ length: 5 }, () =>
      ideas.vote(users[1].id, id, posted.id, { voted: true }),
    ),
  );
  expect(await db.ideaVote.count({ where: { ideaId: posted.id } })).toBe(1);
  await ideas.vote(users[2].id, id, posted.id, { voted: true });
  expect((await ideas.list(users[1].id, id)).items[0]).toMatchObject({
    voteCount: 2,
    voted: true,
  });
  expect((await ideas.list(users[0].id, id)).items[0]).toMatchObject({
    voteCount: 2,
    voted: false,
  });
  await Promise.all(
    Array.from({ length: 3 }, () =>
      ideas.vote(users[1].id, id, posted.id, { voted: false }),
    ),
  );
  expect((await ideas.list(users[1].id, id)).items[0]).toMatchObject({
    voteCount: 1,
    voted: false,
  });
});
it("allows author or owner deletion and cascades votes", async () => {
  const id = await project(),
    posted = await idea(id);
  await ideas.vote(users[2].id, id, posted.id, { voted: true });
  await expect(
    ideas.remove(users[2].id, id, posted.id, {}),
  ).rejects.toBeInstanceOf(IdeaNotFoundError);
  await ideas.remove(users[1].id, id, posted.id, {});
  expect(await db.ideaVote.count({ where: { ideaId: posted.id } })).toBe(0);
  const moderated = await idea(id);
  await ideas.remove(users[0].id, id, moderated.id, {});
  await expect(
    ideas.vote(users[2].id, id, moderated.id, { voted: true }),
  ).rejects.toBeInstanceOf(IdeaNotFoundError);
});
it("removes votes on membership removal and does not restore them on rejoining", async () => {
  const id = await project(),
    posted = await idea(id);
  await ideas.vote(users[1].id, id, posted.id, { voted: true });
  await members.remove(users[0].id, id, { userId: users[1].id });
  expect((await ideas.list(users[0].id, id)).items[0]).toMatchObject({
    voteCount: 0,
    authorId: users[1].id,
  });
  await expect(
    ideas.vote(users[1].id, id, posted.id, { voted: true }),
  ).rejects.toBeInstanceOf(ProjectNotFoundError);
  await members.add(users[0].id, id, { email: users[1].email });
  expect((await ideas.list(users[1].id, id)).items[0].voted).toBe(false);
});
it("blocks disabled members while retaining their existing votes", async () => {
  const id = await project(),
    posted = await idea(id);
  await ideas.vote(users[2].id, id, posted.id, { voted: true });
  await db.user.update({
    where: { id: users[2].id },
    data: { isActive: false },
  });
  try {
    await expect(ideas.list(users[2].id, id)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
    await expect(
      ideas.vote(users[2].id, id, posted.id, { voted: false }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect((await ideas.list(users[0].id, id)).items[0].voteCount).toBe(1);
  } finally {
    await db.user.update({
      where: { id: users[2].id },
      data: { isActive: true },
    });
  }
});
it("paginates newest first and clamps a page after deletion", async () => {
  const id = await project();
  await db.idea.createMany({
    data: Array.from({ length: 26 }, (_, i) => ({
      id: randomUUID(),
      projectId: id,
      authorId: users[1].id,
      title: "Proposal " + i,
      body: "Details",
      createdAt: new Date(1700000000000 + i * 1000),
    })),
  });
  const first = await ideas.list(users[0].id, id),
    second = await ideas.list(users[0].id, id, 2);
  expect(first.items).toHaveLength(25);
  expect(first.items[0].title).toBe("Proposal 25");
  expect(second.items[0].title).toBe("Proposal 0");
  await ideas.remove(users[0].id, id, second.items[0].id, {});
  expect(await ideas.list(users[0].id, id, 2)).toMatchObject({
    page: 1,
    pageCount: 1,
    total: 25,
  });
});
it("keeps former authors' ideas and removes all proposal data with the project", async () => {
  const id = await project(),
    posted = await idea(id);
  // Account deletion removes memberships before deleting the account.
  const former = await db.user.create({
    data: {
      name: "Former proposer",
      email: randomUUID() + "@example.com",
      passwordHash: "test-only",
    },
  });
  users.push({ id: former.id, email: former.email });
  await members.add(users[0].id, id, { email: former.email });
  const retained = await ideas.create(former.id, id, {
    title: "Retain this idea",
    body: "Shared work",
  });
  await ideas.vote(former.id, id, posted.id, { voted: true });
  await db.projectMember.deleteMany({ where: { userId: former.id } });
  await db.user.delete({ where: { id: former.id } });
  expect(
    (await ideas.list(users[0].id, id)).items.find(
      (item) => item.id === retained.id,
    ),
  ).toMatchObject({ authorId: null, authorName: "Former user" });
  expect(await db.ideaVote.count({ where: { ideaId: posted.id } })).toBe(0);
  await db.project.delete({ where: { id } });
  expect(await db.idea.count({ where: { projectId: id } })).toBe(0);
  expect(await db.ideaVote.count({ where: { projectId: id } })).toBe(0);
});
