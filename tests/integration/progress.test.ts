import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createProjectService } from "@/lib/project-service";
import { createTaskService } from "@/lib/task-service";
import { createMemberService } from "@/lib/member-service";
import { testDatabaseUrl } from "../../scripts/test-database";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const projects = createProjectService(db);
const tasks = createTaskService(db);
const members = createMemberService(db);
const users: { id: string; email: string }[] = [];
const projectIds: string[] = [];
const today = "2026-11-22";
beforeAll(async () => {
  for (const name of ["Progress owner", "Progress member", "Progress outsider"])
    users.push(
      await db.user.create({
        data: {
          name,
          email: "progress-" + randomUUID() + "@example.com",
          passwordHash: "test-only-not-a-login",
        },
        select: { id: true, email: true },
      }),
    );
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.user.deleteMany({
    where: { id: { in: users.map((user) => user.id) } },
  });
  await db.$disconnect();
});
async function create(ownerIndex = 0) {
  const project = await projects.create(users[ownerIndex].id, {
    name: "Progress " + randomUUID(),
  });
  projectIds.push(project.id);
  return project.id;
}
async function summary(userIndex: number, id: string) {
  return (await projects.list(users[userIndex].id, today)).find(
    (project) => project.id === id,
  )!;
}

it("returns an explicit zero summary for an empty project without sending raw tasks", async () => {
  const id = await create();
  const project = await summary(0, id);
  expect(project.progress).toEqual({
    total: 0,
    completed: 0,
    remaining: 0,
    todo: 0,
    inProgress: 0,
    overdue: 0,
    percentComplete: 0,
  });
  expect(project).not.toHaveProperty("tasks");
});

it("uses all project tasks for owner and member summaries while excluding unrelated projects", async () => {
  const id = await create();
  const hiddenId = await create(2);
  await members.add(users[0].id, id, { email: users[1].email });
  for (const input of [
    {
      title: "Past unfinished",
      dueDate: "2026-11-21",
      assigneeId: users[1].id,
    },
    { title: "Due today", dueDate: today },
    { title: "Future active", dueDate: "2026-11-23", status: "IN_PROGRESS" },
    { title: "Past completed", dueDate: "2026-11-20", status: "DONE" },
    { title: "Completed without date", status: "DONE" },
  ])
    await tasks.create(users[0].id, id, input);
  await tasks.create(users[2].id, hiddenId, {
    title: "Private overdue task",
    dueDate: "2026-11-19",
  });
  const expected = {
    total: 5,
    completed: 2,
    remaining: 3,
    todo: 2,
    inProgress: 1,
    overdue: 1,
    percentComplete: 40,
  };
  expect((await summary(0, id)).progress).toEqual(expected);
  expect((await summary(1, id)).progress).toEqual(expected);
  expect(await summary(2, id)).toBeUndefined();
  expect(await summary(0, hiddenId)).toBeUndefined();
  await members.remove(users[0].id, id, { userId: users[1].id });
  expect(await summary(1, id)).toBeUndefined();
  expect((await summary(0, id)).progress).toEqual(expected);
});

it("recalculates from saved work after status, date, and deletion changes", async () => {
  const id = await create();
  const task = await tasks.create(users[0].id, id, {
    title: "Changing work",
    dueDate: "2026-11-21",
  });
  expect((await summary(0, id)).progress).toMatchObject({
    total: 1,
    overdue: 1,
    percentComplete: 0,
  });
  await tasks.edit(users[0].id, id, task.id, { status: "DONE" });
  expect((await summary(0, id)).progress).toMatchObject({
    completed: 1,
    remaining: 0,
    overdue: 0,
    percentComplete: 100,
  });
  await tasks.edit(users[0].id, id, task.id, {
    status: "TODO",
    dueDate: today,
  });
  expect((await summary(0, id)).progress).toMatchObject({
    completed: 0,
    remaining: 1,
    overdue: 0,
  });
  await tasks.edit(users[0].id, id, task.id, { dueDate: "2026-11-20" });
  expect((await summary(0, id)).progress.overdue).toBe(1);
  await tasks.remove(users[0].id, id, task.id, {});
  expect((await summary(0, id)).progress).toMatchObject({
    total: 0,
    overdue: 0,
    percentComplete: 0,
  });
});
