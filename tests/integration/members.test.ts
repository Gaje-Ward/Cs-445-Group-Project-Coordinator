import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createMemberService, MemberChangeError } from "@/lib/member-service";
import {
  createProjectService,
  ProjectNotFoundError,
} from "@/lib/project-service";
import { testDatabaseUrl } from "../../scripts/test-database";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});
const members = createMemberService(db);
const projects = createProjectService(db);
const users: { id: string; email: string; name: string }[] = [];
const projectIds: string[] = [];

beforeAll(async () => {
  for (const name of ["Team owner", "Teammate", "Unrelated student"]) {
    users.push(
      await db.user.create({
        data: {
          name,
          email: "members-" + randomUUID() + "@example.com",
          passwordHash: "test-only-not-a-login",
        },
        select: { id: true, email: true, name: true },
      }),
    );
  }
});

afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.user.deleteMany({
    where: { id: { in: users.map((user) => user.id) } },
  });
  await db.$disconnect();
});

async function project(ownerId = users[0].id) {
  const created = await projects.create(ownerId, {
    name: "Membership test " + randomUUID(),
  });
  projectIds.push(created.id);
  return created.id;
}

it("adds an existing account by normalized email and grants project access", async () => {
  const id = await project();
  const member = await members.add(users[0].id, id, {
    email: "  " + users[1].email.toUpperCase() + "  ",
  });
  expect(member).toEqual({
    userId: users[1].id,
    name: users[1].name,
    role: "MEMBER",
  });
  expect((await projects.list(users[1].id)).map((item) => item.id)).toContain(
    id,
  );
  expect(await projects.get(users[1].id, id)).toMatchObject({ role: "MEMBER" });
  const roster = await members.list(users[1].id, id);
  expect(roster.map((entry) => entry.userId)).toEqual([
    users[0].id,
    users[1].id,
  ]);
  for (const entry of roster)
    expect(Object.keys(entry).sort()).toEqual(["name", "role", "userId"]);
});

it("allows only the owner to change membership, without exposing account lookup results", async () => {
  const id = await project();
  await members.add(users[0].id, id, { email: users[1].email });
  for (const actor of [users[1], users[2]]) {
    for (const email of [
      users[2].email,
      "missing-" + randomUUID() + "@example.com",
    ]) {
      await expect(members.add(actor.id, id, { email })).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
    }
    await expect(
      members.remove(actor.id, id, { userId: users[1].id }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  }
  expect((await members.list(users[0].id, id)).length).toBe(2);
  await expect(members.list(users[2].id, id)).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(members.list(users[2].id, "missing")).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
});

it("rejects missing accounts without creating accounts or memberships", async () => {
  const id = await project();
  const email = "unregistered-" + randomUUID() + "@example.com";
  await expect(members.add(users[0].id, id, { email })).rejects.toMatchObject({
    status: 400,
  });
  expect(await db.user.findUnique({ where: { email } })).toBeNull();
  expect(await members.list(users[0].id, id)).toHaveLength(1);
});

it("handles concurrent duplicate adds and cannot demote the owner", async () => {
  const id = await project();
  const results = await Promise.allSettled([
    members.add(users[0].id, id, { email: users[1].email }),
    members.add(users[0].id, id, { email: users[1].email }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const failed = results.find((result) => result.status === "rejected");
  expect(failed?.status === "rejected" && failed.reason).toBeInstanceOf(
    MemberChangeError,
  );
  expect(failed?.status === "rejected" && failed.reason.status).toBe(409);
  await expect(
    members.add(users[0].id, id, { email: users[0].email }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await members.list(users[0].id, id)).filter(
      (entry) => entry.role === "OWNER",
    ),
  ).toEqual([{ userId: users[0].id, name: users[0].name, role: "OWNER" }]);
});

it("removes a member and revokes project reads, roster reads, and dashboard listing", async () => {
  const id = await project();
  await members.add(users[0].id, id, { email: users[1].email });
  await members.remove(users[0].id, id, { userId: users[1].id });
  await expect(projects.get(users[1].id, id)).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  await expect(members.list(users[1].id, id)).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
  expect(
    (await projects.list(users[1].id)).map((item) => item.id),
  ).not.toContain(id);
  await expect(
    members.remove(users[0].id, id, { userId: users[1].id }),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    await db.user.findUnique({ where: { id: users[1].id } }),
  ).not.toBeNull();
  await members.add(users[0].id, id, { email: users[1].email });
  expect(await projects.get(users[1].id, id)).toMatchObject({ role: "MEMBER" });
});

it("preserves owners and memberships in other projects", async () => {
  const id = await project();
  const otherId = await project(users[2].id);
  await members.add(users[2].id, otherId, { email: users[1].email });
  await expect(
    members.remove(users[0].id, id, { userId: users[0].id }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    members.remove(users[0].id, id, { userId: users[1].id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    members.remove(users[0].id, otherId, { userId: users[1].id }),
  ).rejects.toBeInstanceOf(ProjectNotFoundError);
  expect(await projects.get(users[1].id, otherId)).toMatchObject({
    role: "MEMBER",
  });
  expect(await projects.get(users[0].id, id)).toMatchObject({ role: "OWNER" });
});

it("rejects client-supplied roles and invalid removal payloads without changing membership", async () => {
  const id = await project();
  await expect(
    members.add(users[0].id, id, { email: users[1].email, role: "OWNER" }),
  ).rejects.toThrow();
  await expect(
    members.add(users[0].id, id, { email: "not-an-email" }),
  ).rejects.toThrow();
  await expect(
    members.remove(users[0].id, id, { userId: users[0].id, role: "MEMBER" }),
  ).rejects.toThrow();
  await expect(
    members.remove(users[0].id, id, { userId: "" }),
  ).rejects.toThrow();
  expect(await members.list(users[0].id, id)).toHaveLength(1);
});
