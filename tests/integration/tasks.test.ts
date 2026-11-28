import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createTaskService,
  TaskNotFoundError,
  TaskAssignmentError,
} from "@/lib/task-service";
import {
  createProjectService,
  ProjectNotFoundError,
} from "@/lib/project-service";
import { createMemberService } from "@/lib/member-service";
import { testDatabaseUrl } from "../../scripts/test-database";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const tasks = createTaskService(db);
const projects = createProjectService(db);
const members = createMemberService(db);
const users: { id: string; email: string }[] = [];
const projectIds: string[] = [];
beforeAll(async () => {
  for (const name of ["Task owner", "Task member", "Task outsider"]) {
    users.push(
      await db.user.create({
        data: {
          name,
          email: "tasks-" + randomUUID() + "@example.com",
          passwordHash: "test-only-not-a-login",
        },
        select: { id: true, email: true },
      }),
    );
  }
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
async function project(ownerIndex = 0) {
  const created = await projects.create(users[ownerIndex].id, {
    name: "Task test " + randomUUID(),
  });
  projectIds.push(created.id);
  if (ownerIndex === 0)
    await members.add(users[0].id, created.id, { email: users[1].email });
  return created.id;
}
const input = {
  title: "  Draft the report  ",
  description: "  Outline the findings  ",
  dueDate: "2026-12-05",
};

it("persists tasks created by a member with normalized fields and a same-project assignee", async () => {
  const id = await project();
  const task = await tasks.create(users[1].id, id, {
    ...input,
    assigneeId: users[0].id,
  });
  expect(task).toMatchObject({
    title: "Draft the report",
    description: "Outline the findings",
    status: "TODO",
    assigneeId: users[0].id,
    assigneeName: "Task owner",
  });
  expect(task.dueDate?.toISOString()).toBe("2026-12-05T00:00:00.000Z");
  expect(task).not.toHaveProperty("assigneeProjectId");
  expect(task).not.toHaveProperty("assignee");
  expect(task.createdAt).toBeInstanceOf(Date);
  expect(await tasks.list(users[0].id, id)).toHaveLength(1);
  expect(await tasks.list(users[1].id, id)).toHaveLength(1);
});

it("keeps partial edits from clearing fields and allows completing and reopening work", async () => {
  const id = await project();
  const task = await tasks.create(users[0].id, id, {
    ...input,
    assigneeId: users[1].id,
  });
  for (const status of ["IN_PROGRESS", "DONE", "TODO"]) {
    const saved = await tasks.edit(users[1].id, id, task.id, { status });
    expect(saved).toMatchObject({
      status,
      title: "Draft the report",
      description: "Outline the findings",
      assigneeId: users[1].id,
    });
    expect(saved.dueDate?.toISOString()).toBe("2026-12-05T00:00:00.000Z");
  }
  expect(
    await tasks.edit(users[0].id, id, task.id, {
      title: "Revised report",
      description: "",
      dueDate: "",
      assigneeId: "",
    }),
  ).toMatchObject({
    title: "Revised report",
    description: null,
    dueDate: null,
    assigneeId: null,
    assigneeName: null,
  });
});

it("denies outsiders and task IDs from another project without changing stored work", async () => {
  const id = await project();
  const otherId = await project(2);
  const task = await tasks.create(users[0].id, id, input);
  const other = await tasks.create(users[2].id, otherId, {
    title: "Private task",
  });
  await expect(tasks.list(users[2].id, id)).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(tasks.list(users[2].id, "missing")).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(tasks.create(users[2].id, id, input)).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(
    tasks.edit(users[2].id, id, task.id, { status: "DONE" }),
  ).rejects.toBeInstanceOf(ProjectNotFoundError);
  await expect(
    tasks.edit(users[0].id, id, other.id, { status: "DONE" }),
  ).rejects.toBeInstanceOf(TaskNotFoundError);
  await expect(
    tasks.remove(users[0].id, id, other.id, {}),
  ).rejects.toBeInstanceOf(TaskNotFoundError);
  expect((await tasks.list(users[2].id, otherId))[0].title).toBe(
    "Private task",
  );
  expect((await tasks.list(users[0].id, id))[0].status).toBe("TODO");
});

it("rejects assignees outside the project on creation and editing", async () => {
  const id = await project();
  await project(2);
  await expect(
    tasks.create(users[0].id, id, { ...input, assigneeId: users[2].id }),
  ).rejects.toBeInstanceOf(TaskAssignmentError);
  const task = await tasks.create(users[0].id, id, input);
  await expect(
    tasks.edit(users[1].id, id, task.id, { assigneeId: users[2].id }),
  ).rejects.toBeInstanceOf(TaskAssignmentError);
  expect((await tasks.list(users[0].id, id))[0].assigneeId).toBeNull();
});

it("enforces assignment membership and project equality in the database itself", async () => {
  const id = await project();
  const otherId = await project(2);
  await expect(
    db.task.create({
      data: {
        projectId: id,
        title: "Invalid membership",
        assigneeProjectId: id,
        assigneeId: users[2].id,
      },
    }),
  ).rejects.toMatchObject({ code: "P2003" });
  await expect(
    db.task.create({
      data: {
        projectId: id,
        title: "Wrong project",
        assigneeProjectId: otherId,
        assigneeId: users[2].id,
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.task.create({
      data: {
        projectId: id,
        title: "Incomplete assignment",
        assigneeProjectId: null,
        assigneeId: users[1].id,
      },
    }),
  ).rejects.toThrow();
  expect(await tasks.list(users[0].id, id)).toEqual([]);
});

it("unassigns work when a teammate is removed and denies later requests from that teammate", async () => {
  const id = await project();
  const task = await tasks.create(users[1].id, id, {
    ...input,
    status: "IN_PROGRESS",
    assigneeId: users[1].id,
  });
  await members.remove(users[0].id, id, { userId: users[1].id });
  expect((await tasks.list(users[0].id, id))[0]).toMatchObject({
    id: task.id,
    status: "IN_PROGRESS",
    assigneeId: null,
    assigneeName: null,
  });
  await expect(tasks.list(users[1].id, id)).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(
    tasks.edit(users[1].id, id, task.id, { status: "DONE" }),
  ).rejects.toBeInstanceOf(ProjectNotFoundError);
  await members.add(users[0].id, id, { email: users[1].email });
  expect((await tasks.list(users[1].id, id))[0].assigneeId).toBeNull();
});

it("cannot retain an invalid assignment when adding a task races with membership removal", async () => {
  const id = await project();
  const [created, removed] = await Promise.allSettled([
    tasks.create(users[0].id, id, { ...input, assigneeId: users[1].id }),
    members.remove(users[0].id, id, { userId: users[1].id }),
  ]);
  expect(removed.status).toBe("fulfilled");
  if (created.status === "rejected")
    expect(created.reason).toBeInstanceOf(TaskAssignmentError);
  for (const task of await tasks.list(users[0].id, id))
    expect(task.assigneeId).toBeNull();
  expect(
    await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: users[1].id } },
    }),
  ).toBeNull();
});

it("allows only owners to delete tasks and cascades task cleanup with a project", async () => {
  const id = await project();
  const task = await tasks.create(users[1].id, id, input);
  await expect(
    tasks.remove(users[1].id, id, task.id, {}),
  ).rejects.toBeInstanceOf(TaskNotFoundError);
  await expect(
    tasks.remove(users[2].id, id, task.id, {}),
  ).rejects.toBeInstanceOf(ProjectNotFoundError);
  expect(await tasks.list(users[0].id, id)).toHaveLength(1);
  await tasks.remove(users[0].id, id, task.id, {});
  await expect(
    tasks.remove(users[0].id, id, task.id, {}),
  ).rejects.toBeInstanceOf(TaskNotFoundError);
  const remaining = await tasks.create(users[0].id, id, {
    ...input,
    assigneeId: users[0].id,
  });
  await db.project.delete({ where: { id } });
  expect(await db.task.findUnique({ where: { id: remaining.id } })).toBeNull();
});
