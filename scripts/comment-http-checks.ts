import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { PrismaClient } from "../src/generated/prisma/client";
export async function commentHttpChecks(db: PrismaClient, base: string) {
  const password = "a long discussion test passphrase",
    passwordHash = await hash(password, 12);
  const users: { id: string; email: string }[] = [],
    projectIds: string[] = [];
  const headers = { Origin: base, "Content-Type": "application/json" };
  async function client(index: number) {
    const jar = new Map<string, string>();
    async function request(path: string, init: RequestInit = {}) {
      const requestHeaders = new Headers(init.headers);
      if (jar.size)
        requestHeaders.set(
          "Cookie",
          [...jar].map(([key, value]) => key + "=" + value).join("; "),
        );
      const response = await fetch(base + path, {
        ...init,
        headers: requestHeaders,
        redirect: "manual",
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";", 1)[0],
          at = pair.indexOf("="),
          key = pair.slice(0, at),
          value = pair.slice(at + 1);
        if (value) jar.set(key, value);
        else jar.delete(key);
      }
      return response;
    }
    const csrfToken = (await (await request("/api/auth/csrf")).json())
      .csrfToken;
    assert.equal(
      (
        await request("/api/auth/callback/credentials", {
          method: "POST",
          headers: {
            Origin: base,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            csrfToken,
            email: users[index].email,
            password,
            callbackUrl: base + "/dashboard",
            json: "true",
          }),
        })
      ).status,
      200,
    );
    return request;
  }
  try {
    for (const [index, name] of [
      "Discussion HTTP owner",
      "Discussion HTTP author",
      "Discussion HTTP peer",
      "Discussion HTTP outsider",
    ].entries())
      users.push(
        await db.user.create({
          data: {
            name,
            email: randomUUID() + "@example.com",
            passwordHash,
            isAdmin: index === 3,
          },
          select: { id: true, email: true },
        }),
      );
    for (let index = 0; index < 2; index++) {
      const project = await db.project.create({
        data: {
          name: "HTTP discussion " + randomUUID(),
          memberships: {
            create: users.slice(0, 3).map((user, n) => ({
              userId: user.id,
              role: n === 0 ? ("OWNER" as const) : ("MEMBER" as const),
            })),
          },
        },
        select: { id: true },
      });
      projectIds.push(project.id);
    }
    const [owner, author, peer, outsider] = await Promise.all(
      users.map((_, index) => client(index)),
    );
    const path = "/api/projects/" + projectIds[0] + "/comments";
    const mutate = (
      request: typeof owner,
      method: string,
      input: object,
      id = "",
      origin = base,
    ) =>
      request(path + (id ? "/" + id : ""), {
        method,
        headers: { ...headers, Origin: origin },
        body: JSON.stringify(input),
      });
    const initial = await owner(path);
    assert.equal(initial.status, 200);
    assert.match(initial.headers.get("cache-control")!, /no-store/);
    assert.deepEqual((await initial.json()).items, []);
    for (const body of ["   ", "x".repeat(4001)])
      assert.equal((await mutate(author, "POST", { body })).status, 400);
    for (const extra of [
      { authorId: users[0].id },
      { projectId: projectIds[1] },
      { createdAt: "forged" },
    ])
      assert.equal(
        (await mutate(author, "POST", { body: "Tampered", ...extra })).status,
        400,
      );
    assert.equal(
      (
        await mutate(
          author,
          "POST",
          { body: "Wrong origin" },
          "",
          "https://elsewhere.test",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await author(path, {
          method: "POST",
          headers: { Origin: base, "Content-Type": "text/plain" },
          body: "plain",
        })
      ).status,
      415,
    );
    assert.equal(
      (await mutate(author, "POST", { body: "x".repeat(17000) })).status,
      413,
    );
    assert.equal((await owner(path + "?page=0")).status, 400);
    assert.equal((await owner(path + "?page=bad")).status, 400);
    const body = "Literal <img src=x onerror=alert(1)>\nA project decision.";
    const posted = await mutate(author, "POST", { body });
    assert.equal(posted.status, 201);
    const comment = (await posted.json()).comment;
    assert.equal(comment.authorId, users[1].id);
    assert.equal(comment.authorName, "Discussion HTTP author");
    assert.equal(comment.body, body);
    assert.equal(comment.version, 0);
    assert.ok(
      !("author" in comment) &&
        !("email" in comment) &&
        !("passwordHash" in comment),
    );
    assert.equal(
      (
        await mutate(
          owner,
          "PATCH",
          { body: "Owner overwrite", version: 0 },
          comment.id,
        )
      ).status,
      404,
    );
    assert.equal(
      (await mutate(peer, "DELETE", { version: 0 }, comment.id)).status,
      404,
    );
    assert.equal(
      (
        await author(
          "/api/projects/" + projectIds[1] + "/comments/" + comment.id,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ body: "Wrong project", version: 0 }),
          },
        )
      ).status,
      404,
    );
    assert.equal((await outsider(path)).status, 404);
    assert.equal(
      (await mutate(outsider, "POST", { body: "No membership" })).status,
      404,
    );
    assert.equal(
      (
        await mutate(
          outsider,
          "PATCH",
          { body: "No membership", version: 0 },
          comment.id,
        )
      ).status,
      404,
    );
    assert.equal(
      (await mutate(outsider, "DELETE", { version: 0 }, comment.id)).status,
      404,
    );
    const page = await owner("/projects/" + projectIds[0]);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(
      html.includes('id="project-discussion"') &&
        html.includes("Discussion HTTP author") &&
        html.includes("&lt;img"),
    );
    assert.ok(!html.includes("<img src=x onerror="));
    const edited = await mutate(
      author,
      "PATCH",
      { body: "Edited decision", version: 0 },
      comment.id,
    );
    assert.equal(edited.status, 200);
    const updated = (await edited.json()).comment;
    assert.equal(updated.version, 1);
    assert.equal(updated.createdAt, comment.createdAt);
    assert.equal(
      (
        await mutate(
          author,
          "PATCH",
          { body: "Stale overwrite", version: 0 },
          comment.id,
        )
      ).status,
      409,
    );
    assert.equal(
      (await mutate(owner, "DELETE", { version: 0 }, comment.id)).status,
      409,
    );
    const races = await Promise.all([
      mutate(
        author,
        "PATCH",
        { body: "Concurrent one", version: 1 },
        comment.id,
      ),
      mutate(
        author,
        "PATCH",
        { body: "Concurrent two", version: 1 },
        comment.id,
      ),
    ]);
    assert.deepEqual(
      races.map((response) => response.status).sort(),
      [200, 409],
    );
    const current = (await (await owner(path)).json()).items[0];
    assert.equal(current.version, 2);
    assert.equal(
      (
        await owner("/api/projects/" + projectIds[0] + "/members", {
          method: "DELETE",
          headers,
          body: JSON.stringify({ userId: users[1].id }),
        })
      ).status,
      200,
    );
    assert.equal((await author(path)).status, 404);
    assert.equal(
      (await mutate(author, "POST", { body: "After removal" })).status,
      404,
    );
    assert.equal(
      (
        await mutate(
          author,
          "PATCH",
          { body: "After removal", version: 2 },
          comment.id,
        )
      ).status,
      404,
    );
    assert.equal(
      (await mutate(author, "DELETE", { version: 2 }, comment.id)).status,
      404,
    );
    assert.equal(
      (
        await outsider("/api/admin/users/" + users[1].id, {
          method: "DELETE",
          headers,
          body: JSON.stringify({ confirmationEmail: users[1].email }),
        })
      ).status,
      200,
    );
    assert.equal((await author(path)).status, 401);
    const retained = (await (await owner(path)).json()).items[0];
    assert.equal(retained.authorName, "Former user");
    assert.equal(retained.authorId, null);
    assert.equal(retained.body, current.body);
    assert.equal(
      (await mutate(owner, "DELETE", { version: 2 }, comment.id)).status,
      200,
    );
    await db.comment.createMany({
      data: Array.from({ length: 26 }, (_, index) => ({
        id: randomUUID(),
        projectId: projectIds[0],
        authorId: users[2].id,
        body: "HTTP pagination entry " + index,
        createdAt: new Date(index * 1000),
      })),
    });
    const first = await (await owner(path + "?page=1")).json(),
      second = await (await owner(path + "?page=2")).json();
    assert.equal(first.items.length, 25);
    assert.equal(second.items.length, 1);
    assert.equal(first.total, 26);
    assert.equal(second.pageCount, 2);
    const older = await (
      await owner("/projects/" + projectIds[0] + "?commentsPage=2")
    ).text();
    assert.ok(
      older.includes("Newer comments") &&
        older.includes("HTTP pagination entry 0"),
    );
    assert.equal(
      (await mutate(owner, "DELETE", { version: 0 }, second.items[0].id))
        .status,
      200,
    );
    const clamped = await (await owner(path + "?page=2")).json();
    assert.equal(clamped.page, 1);
    assert.equal(clamped.total, 25);
    assert.equal(
      (
        await outsider("/api/admin/users/" + users[2].id, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ isActive: false }),
        })
      ).status,
      200,
    );
    assert.equal((await peer(path)).status, 401);
    console.log(
      "Comment HTTP checks passed: discussion posts, author editing, owner moderation, stale versions, pagination, and revoked access.",
    );
  } finally {
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.deletionRecord.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await db.user.deleteMany({
      where: { id: { in: users.map((user) => user.id) } },
    });
  }
}
