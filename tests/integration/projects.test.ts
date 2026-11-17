import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  createProjectService,
  ProjectNotFoundError,
} from "@/lib/project-service";
import { testDatabaseUrl } from "../../scripts/test-database";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const service = createProjectService(db);
const ids: string[] = [];
const projectIds: string[] = [];
let owner: string, member: string, outsider: string;
beforeAll(async () => {
  for (const name of ["Owner", "Member", "Outsider"]) {
    const user = await db.user.create({
      data: {
        name,
        email: `projects-${randomUUID()}@example.com`,
        passwordHash: "test-only-not-a-login",
      },
    });
    ids.push(user.id);
  }
  [owner, member, outsider] = ids;
});
afterAll(async () => {
  // Delete only this test's projects first; user deletion is deliberately restricted.
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
async function create(name = "Integration project") {
  const project = await service.create(owner, {
    name,
    description: "Saved notes",
    deadline: "2027-04-30",
  });
  projectIds.push(project.id);
  return project;
}
it("persists the project and creates exactly one owner membership", async () => {
  const project = await create();
  const stored = await db.project.findUniqueOrThrow({
    where: { id: project.id },
    include: { memberships: true },
  });
  expect(stored.name).toBe(project.name);
  expect(stored.description).toBe("Saved notes");
  expect(stored.deadline?.toISOString()).toBe("2027-04-30T00:00:00.000Z");
  expect(stored.createdAt).toBeInstanceOf(Date);
  expect(stored.updatedAt).toBeInstanceOf(Date);
  expect(stored.memberships).toEqual([
    { userId: owner, projectId: project.id, role: "OWNER" },
  ]);
});
it("rolls back the project when its membership cannot be created", async () => {
  const name = "atomic-" + randomUUID();
  await expect(
    service.create("missing-" + randomUUID(), { name }),
  ).rejects.toMatchObject({ code: "P2003" });
  expect(await db.project.count({ where: { name } })).toBe(0);
});
it("filters listings and reads by membership without exposing other memberships", async () => {
  const project = await create("Shared project");
  await db.projectMember.create({
    data: { projectId: project.id, userId: member },
  });
  expect((await service.list(owner)).map((p) => p.id)).toContain(project.id);
  expect((await service.list(member)).map((p) => p.id)).toEqual([project.id]);
  expect(await service.list(outsider)).toEqual([]);
  expect(await service.get(member, project.id)).toMatchObject({
    role: "MEMBER",
  });
  expect(await service.get(owner, project.id)).not.toHaveProperty(
    "memberships",
  );
  await expect(service.get(outsider, project.id)).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(service.get(outsider, "missing")).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(
    db.projectMember.create({
      data: { projectId: project.id, userId: member },
    }),
  ).rejects.toMatchObject({ code: "P2002" });
});
it("allows only owners to edit, including clearing optional fields", async () => {
  const project = await create("Owner edits");
  await db.projectMember.create({
    data: { projectId: project.id, userId: member },
  });
  for (const userId of [member, outsider])
    await expect(
      service.edit(userId, project.id, { name: "Unauthorized" }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  expect((await service.get(owner, project.id)).name).toBe("Owner edits");
  const updated = await service.edit(owner, project.id, {
    name: "Updated name",
    description: "",
    deadline: null,
  });
  expect(updated).toMatchObject({
    name: "Updated name",
    description: null,
    deadline: null,
  });
  expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
    project.updatedAt.getTime(),
  );
  await expect(
    service.edit(owner, project.id, { name: " " }),
  ).rejects.toThrow();
  expect((await service.get(owner, project.id)).name).toBe("Updated name");
});
it("restricts deleting a user with memberships and cascades project cleanup", async () => {
  const project = await create("Deletion constraints");
  await expect(db.user.delete({ where: { id: owner } })).rejects.toMatchObject({
    code: "P2003",
  });
  await db.project.delete({ where: { id: project.id } });
  expect(
    await db.projectMember.count({ where: { projectId: project.id } }),
  ).toBe(0);
  expect(await db.user.count({ where: { id: owner } })).toBe(1);
});
