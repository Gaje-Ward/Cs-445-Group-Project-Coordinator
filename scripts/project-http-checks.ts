import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import { taskHttpChecks } from "./task-http-checks";
import { progressHttpChecks } from "./progress-http-checks";
type Requester = (route: string, init?: RequestInit) => Promise<Response>;

export async function anonymousProjectChecks(request: Requester) {
  for (const route of [
    "/api/projects",
    "/api/projects/missing",
    "/api/projects/missing/members",
    "/api/projects/missing/tasks",
  ])
    assert.equal((await request(route)).status, 401);
  for (const [route, method] of [
    ["/api/projects", "POST"],
    ["/api/projects/missing", "PATCH"],
    ["/api/projects/missing/members", "POST"],
    ["/api/projects/missing/members", "DELETE"],
    ["/api/projects/missing/tasks", "POST"],
    ["/api/projects/missing/tasks/missing", "PATCH"],
    ["/api/projects/missing/tasks/missing", "DELETE"],
  ]) {
    assert.equal((await request(route, { method })).status, 401);
  }
  for (const route of [
    "/projects/new",
    "/projects/missing",
    "/projects/missing/edit",
  ]) {
    const response = await request(route);
    const body = await response.text();
    assert.ok(
      response.headers.get("location")?.includes("/login") ||
        (/NEXT_REDIRECT|http-equiv="refresh"/.test(body) &&
          body.includes("/login")),
      route + " requires login",
    );
    assert.ok(!body.includes('id="project-name"'));
  }
}

export async function projectHttpChecks({
  request,
  csrf,
  db,
  base,
  owner,
}: {
  request: Requester;
  csrf: () => Promise<string>;
  db: PrismaClient;
  base: string;
  owner: { id: string; email: string; password: string };
}) {
  const headers = { "Content-Type": "application/json", Origin: base };
  const projectIds: string[] = [],
    userIds: string[] = [];
  async function login(email: string) {
    const response = await request("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: base,
      },
      body: new URLSearchParams({
        csrfToken: await csrf(),
        email,
        password: owner.password,
        callbackUrl: base + "/dashboard",
        json: "true",
      }),
    });
    assert.equal(response.status, 200);
  }
  const input = {
    name: "HTTP project " + randomUUID(),
    description: "HTTP saved description",
    deadline: "2027-05-15",
  };
  try {
    assert.equal((await request("/api/projects")).status, 200);
    assert.deepEqual(
      (await (await request("/api/projects")).json()).projects,
      [],
    );
    assert.ok(
      (await (await request("/dashboard")).text()).includes("No projects yet"),
    );
    for (const invalid of [
      { ...input, name: " " },
      { ...input, description: "x".repeat(2001) },
      { ...input, deadline: "2026-02-30" },
      { ...input, userId: "attacker" },
      { ...input, role: "OWNER" },
    ]) {
      assert.equal(
        (
          await request("/api/projects", {
            method: "POST",
            headers,
            body: JSON.stringify(invalid),
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await request("/api/projects", {
          method: "POST",
          headers: { ...headers, Origin: "https://other.example" },
          body: JSON.stringify(input),
        })
      ).status,
      403,
    );
    assert.equal(
      (await request("/api/projects", { method: "POST", headers, body: "{" }))
        .status,
      400,
    );
    assert.equal(
      (
        await request("/api/projects", {
          method: "POST",
          headers,
          body: JSON.stringify({ ...input, description: "x".repeat(17000) }),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await request("/api/projects", {
          method: "POST",
          headers: { Origin: base },
          body: JSON.stringify(input),
        })
      ).status,
      415,
    );
    const created = await request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(created.status, 201);
    const project = (await created.json()).project;
    projectIds.push(project.id);
    assert.equal(
      (
        await db.projectMember.findUniqueOrThrow({
          where: {
            projectId_userId: { projectId: project.id, userId: owner.id },
          },
        })
      ).role,
      "OWNER",
    );
    assert.ok(
      (await (await request("/dashboard")).text()).includes(input.name),
    );
    assert.ok(
      (await (await request(`/projects/${project.id}`)).text()).includes(
        input.description,
      ),
    );
    assert.ok(
      (await (await request(`/projects/${project.id}/edit`)).text()).includes(
        'id="project-name"',
      ),
    );
    const updated = await request(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        name: "HTTP updated project",
        description: "",
        deadline: "",
      }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).project.deadline, null);
    assert.ok(
      (await (await request(`/projects/${project.id}`)).text()).includes(
        "HTTP updated project",
      ),
    );
    const hash = (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
      .passwordHash;
    const member = await db.user.create({
      data: {
        name: "HTTP member",
        email: "member-" + randomUUID() + "@example.com",
        passwordHash: hash,
      },
    });
    userIds.push(member.id);
    const membersRoute = `/api/projects/${project.id}/members`;
    async function changeMember(
      method: "POST" | "DELETE",
      input: unknown,
      origin = base,
    ) {
      return request(membersRoute, {
        method,
        headers: { ...headers, Origin: origin },
        body: JSON.stringify(input),
      });
    }
    for (const invalid of [
      { email: "invalid" },
      { email: member.email, role: "OWNER" },
      { email: member.email, userId: owner.id },
    ])
      assert.equal((await changeMember("POST", invalid)).status, 400);
    assert.equal(
      (
        await changeMember(
          "POST",
          { email: member.email },
          "https://other.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await changeMember("POST", { email: "x".repeat(17000) })).status,
      413,
    );
    assert.equal(
      (
        await request(membersRoute, {
          method: "POST",
          headers: { Origin: base },
          body: "{}",
        })
      ).status,
      415,
    );
    assert.equal(
      (await request(membersRoute, { method: "DELETE", headers, body: "{" }))
        .status,
      400,
    );
    assert.equal(
      (
        await changeMember("POST", {
          email: "unregistered-" + randomUUID() + "@example.com",
        })
      ).status,
      400,
    );
    const added = await changeMember("POST", {
      email: " " + member.email.toUpperCase() + " ",
    });
    assert.equal(added.status, 201);
    assert.deepEqual((await added.json()).member, {
      userId: member.id,
      name: member.name,
      role: "MEMBER",
    });
    assert.equal(
      (await changeMember("POST", { email: member.email })).status,
      409,
    );
    assert.equal(
      (await changeMember("POST", { email: owner.email })).status,
      409,
    );
    assert.equal(
      (await changeMember("DELETE", { userId: owner.id })).status,
      409,
    );
    const rosterResponse = await request(membersRoute);
    assert.equal(rosterResponse.headers.get("cache-control"), "no-store");
    const roster = (await rosterResponse.json()).members;
    assert.equal(roster.length, 2);
    for (const entry of roster)
      assert.deepEqual(Object.keys(entry).sort(), ["name", "role", "userId"]);
    const ownerPage = await (await request(`/projects/${project.id}`)).text();
    assert.ok(
      ownerPage.includes('id="teammate-email"') &&
        ownerPage.includes(member.name),
    );
    const outsider = await db.user.create({
      data: {
        name: "HTTP outsider",
        email: "outsider-" + randomUUID() + "@example.com",
        passwordHash: hash,
      },
    });
    userIds.push(outsider.id);
    const hidden = await db.project.create({
      data: {
        name: "Hidden outsider project",
        memberships: { create: { userId: outsider.id, role: "OWNER" } },
      },
    });
    projectIds.push(hidden.id);
    const ownerList = (await (await request("/api/projects")).json()).projects;
    assert.deepEqual(
      ownerList.map((p: { id: string }) => p.id),
      [project.id],
    );
    const hiddenRead = await request(`/api/projects/${hidden.id}`);
    assert.equal(hiddenRead.status, 404);
    await login(member.email);
    assert.equal((await request(membersRoute)).status, 200);
    assert.equal(
      (await changeMember("POST", { email: outsider.email })).status,
      404,
    );
    assert.equal(
      (
        await changeMember("POST", {
          email: "unknown-" + randomUUID() + "@example.com",
        })
      ).status,
      404,
    );
    assert.equal(
      (await changeMember("DELETE", { userId: owner.id })).status,
      404,
    );
    assert.equal((await request(`/api/projects/${project.id}`)).status, 200);
    const memberPage = await (await request(`/projects/${project.id}`)).text();
    assert.ok(
      memberPage.includes("HTTP updated project") &&
        !memberPage.includes(">Edit project<"),
    );
    assert.ok(
      !memberPage.includes('id="teammate-email"') &&
        !memberPage.includes('aria-label="Remove '),
    );
    assert.ok(memberPage.includes("HTTP member"));
    assert.deepEqual(
      (await (await request("/api/projects")).json()).projects.map(
        (item: { id: string }) => item.id,
      ),
      [project.id],
    );
    assert.equal(
      (
        await request(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(input),
        })
      ).status,
      404,
    );
    assert.ok(
      (await (await request(`/projects/${project.id}/edit`)).text()).includes(
        "Project not found",
      ),
    );
    await login(outsider.email);
    assert.equal((await request(membersRoute)).status, 404);
    assert.equal(
      (await changeMember("POST", { email: outsider.email })).status,
      404,
    );
    assert.equal(
      (await changeMember("DELETE", { userId: member.id })).status,
      404,
    );
    const denied = await request(`/api/projects/${project.id}`),
      missing = await request("/api/projects/missing");
    assert.equal(denied.status, 404);
    assert.equal(missing.status, 404);
    assert.deepEqual(await denied.json(), await missing.json());
    assert.equal(
      (
        await request(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(input),
        })
      ).status,
      404,
    );
    for (const route of [
      `/projects/${project.id}`,
      `/projects/${project.id}/edit`,
    ]) {
      const body = await (await request(route)).text();
      assert.ok(body.includes("Project not found"));
      assert.ok(
        !body.includes("HTTP updated project") &&
          !body.includes('id="project-name"'),
      );
    }
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } })).name,
      "HTTP updated project",
    );
    await login(owner.email);
    assert.equal(
      (await changeMember("DELETE", { userId: member.id, role: "OWNER" }))
        .status,
      400,
    );
    assert.equal(
      (
        await changeMember(
          "DELETE",
          { userId: member.id },
          "https://other.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await changeMember("DELETE", { userId: member.id })).status,
      200,
    );
    assert.equal(
      (await changeMember("DELETE", { userId: member.id })).status,
      404,
    );
    await login(member.email);
    assert.deepEqual(
      (await (await request("/api/projects")).json()).projects,
      [],
    );
    assert.equal((await request(`/api/projects/${project.id}`)).status, 404);
    assert.equal((await request(membersRoute)).status, 404);
    const removedPage = await (await request(`/projects/${project.id}`)).text();
    assert.ok(
      removedPage.includes("Project not found") &&
        !removedPage.includes("HTTP updated project"),
    );
    await login(owner.email);
    assert.equal((await request(`/api/projects/${project.id}`)).status, 200);
    assert.equal(
      (await changeMember("POST", { email: member.email })).status,
      201,
    );
    assert.equal(
      (await (await request(membersRoute)).json()).members.length,
      2,
    );
    await progressHttpChecks({
      request,
      login,
      projectId: project.id,
      ownerEmail: owner.email,
      memberEmail: member.email,
      outsiderEmail: outsider.email,
      base,
    });
    await taskHttpChecks({
      request,
      login,
      projectId: project.id,
      otherProjectId: hidden.id,
      ownerEmail: owner.email,
      member,
      outsider,
      base,
    });
    console.log(
      "Project HTTP checks passed, including teammate add/remove, owner protection, roster privacy, revoked access, and request validation.",
    );
  } finally {
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
