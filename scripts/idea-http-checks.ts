import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { PrismaClient } from "../src/generated/prisma/client";
export async function ideaHttpChecks(db: PrismaClient, base: string) {
  const password = "a long proposal test passphrase",
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
    assert.equal(
      (await (await request("/api/auth/session")).json()).user.id,
      users[index].id,
    );
    return request;
  }
  try {
    for (const [index, name] of [
      "Idea HTTP owner",
      "Idea HTTP author",
      "Idea HTTP peer",
      "Idea HTTP outsider",
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
    for (let i = 0; i < 2; i++)
      projectIds.push(
        (
          await db.project.create({
            data: {
              name: "Idea HTTP " + randomUUID(),
              memberships: {
                create: users.slice(0, 3).map((user, n) => ({
                  userId: user.id,
                  role: n === 0 ? ("OWNER" as const) : ("MEMBER" as const),
                })),
              },
            },
            select: { id: true },
          })
        ).id,
      );
    const [owner, author, peer, outsider] = await Promise.all(
      users.map((_, index) => client(index)),
    );
    const path = "/api/projects/" + projectIds[0] + "/ideas";
    const mutate = (
      request: typeof owner,
      method: string,
      suffix: string,
      input: object,
    ) =>
      request(path + suffix, { method, headers, body: JSON.stringify(input) });
    const initial = await owner(path);
    assert.equal(initial.status, 200);
    assert.match(initial.headers.get("cache-control")!, /no-store/);
    assert.equal((await outsider(path)).status, 404);
    assert.equal(
      (await mutate(outsider, "POST", "", { title: "No access", body: "No" }))
        .status,
      404,
    );
    for (const input of [
      { title: " ", body: "Details" },
      { title: "Valid", body: " " },
      { title: "x".repeat(121), body: "Details" },
      { title: "Valid", body: "x".repeat(4001) },
      { title: "Valid", body: "Details", authorId: users[0].id },
    ])
      assert.equal((await mutate(author, "POST", "", input)).status, 400);
    assert.equal(
      (
        await author(path, {
          method: "POST",
          headers: { ...headers, Origin: "https://unrelated.example" },
          body: JSON.stringify({ title: "Valid", body: "Details" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await author(path, {
          method: "POST",
          headers: { ...headers, "Content-Type": "text/plain" },
          body: "{}",
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await author(path, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: "Large", body: "x".repeat(17000) }),
        })
      ).status,
      413,
    );
    assert.equal((await owner(path + "?page=0")).status, 400);
    const posted = await mutate(author, "POST", "", {
      title: "  A project proposal  ",
      body: "<img src=x onerror=alert(1)>\nKeep this as text",
    });
    assert.equal(posted.status, 201);
    const idea = (await posted.json()).idea;
    assert.equal(idea.title, "A project proposal");
    assert.equal(idea.authorId, users[1].id);
    assert.equal(idea.voteCount, 0);
    assert.equal(idea.voted, false);
    assert.ok(!("email" in idea));
    const votePath = "/" + idea.id + "/vote";
    assert.equal(
      (await mutate(author, "PUT", votePath, { voted: "true" })).status,
      400,
    );
    assert.equal(
      (
        await mutate(author, "PUT", votePath, {
          voted: true,
          userId: users[2].id,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await outsider(path + votePath, {
          method: "PUT",
          headers,
          body: JSON.stringify({ voted: true }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await owner("/api/projects/" + projectIds[1] + "/ideas" + votePath, {
          method: "PUT",
          headers,
          body: JSON.stringify({ voted: true }),
        })
      ).status,
      404,
    );
    for (const response of await Promise.all(
      Array.from({ length: 4 }, () =>
        mutate(author, "PUT", votePath, { voted: true }),
      ),
    ))
      assert.equal(response.status, 200);
    assert.equal(await db.ideaVote.count({ where: { ideaId: idea.id } }), 1);
    assert.equal(
      (await mutate(peer, "PUT", votePath, { voted: true })).status,
      200,
    );
    const visible = (await (await author(path)).json()).items[0];
    assert.equal(visible.voteCount, 2);
    assert.equal(visible.voted, true);
    assert.ok(!("votes" in visible));
    assert.equal(
      (await mutate(author, "PUT", votePath, { voted: false })).status,
      200,
    );
    assert.equal(
      (await mutate(author, "PUT", votePath, { voted: false })).status,
      200,
    );
    assert.equal(await db.ideaVote.count({ where: { ideaId: idea.id } }), 1);
    const html = await (await owner("/projects/" + projectIds[0])).text();
    assert.ok(html.includes('id="project-ideas"'));
    assert.ok(html.includes("A project proposal"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(!html.includes("<img src=x"));
    assert.equal((await mutate(peer, "DELETE", "/" + idea.id, {})).status, 404);
    assert.equal(
      (await mutate(owner, "DELETE", "/" + idea.id, { authorId: users[1].id }))
        .status,
      400,
    );
    assert.equal(
      (await mutate(owner, "DELETE", "/" + idea.id, {})).status,
      200,
    );
    assert.equal(await db.ideaVote.count({ where: { ideaId: idea.id } }), 0);
    const retained = (
      await (
        await mutate(author, "POST", "", {
          title: "Keep the proposal",
          body: "Shared decision",
        })
      ).json()
    ).idea;
    await mutate(author, "PUT", "/" + retained.id + "/vote", { voted: true });
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
      (
        await mutate(author, "PUT", "/" + retained.id + "/vote", {
          voted: true,
        })
      ).status,
      404,
    );
    assert.equal((await (await owner(path)).json()).items[0].voteCount, 0);
    await db.idea.createMany({
      data: Array.from({ length: 26 }, (_, i) => ({
        projectId: projectIds[0],
        authorId: users[0].id,
        title: "Paginated idea " + i,
        body: "Details",
        createdAt: new Date(1700000000000 + i * 1000),
      })),
    });
    const page = await owner(path + "?page=2");
    assert.equal(page.status, 200);
    assert.equal((await page.json()).items.length, 2);
    const olderHtml = await (
      await owner("/projects/" + projectIds[0] + "?ideasPage=2&commentsPage=1")
    ).text();
    assert.ok(olderHtml.includes("Newer ideas"));
    assert.ok(olderHtml.includes("Paginated idea 0"));
    await db.user.update({
      where: { id: users[2].id },
      data: { isActive: false, sessionVersion: { increment: 1 } },
    });
    assert.equal((await peer(path)).status, 401);
    console.log(
      "Idea HTTP checks passed: proposals, unique votes, vote removal, owner moderation, pagination, project isolation, and revoked access.",
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
