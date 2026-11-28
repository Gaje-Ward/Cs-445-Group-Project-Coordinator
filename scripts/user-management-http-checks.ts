import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import type { PrismaClient } from "../src/generated/prisma/client";
export async function userManagementHttpChecks({
  request,
  db,
  base,
  actorId,
}: {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  db: PrismaClient;
  base: string;
  actorId: string;
}) {
  const password = "a long management test passphrase",
    replacement = "a different management passphrase";
  const email = "managed-" + randomUUID() + "@example.com";
  const target = await db.user.create({
    data: {
      name: "Managed HTTP account",
      email,
      passwordHash: await hash(password, 12),
    },
    select: { id: true },
  });
  const jar = new Map<string, string>();
  async function asUser(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (jar.size)
      headers.set("Cookie", [...jar].map(([k, v]) => k + "=" + v).join("; "));
    const response = await fetch(base + path, {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0],
        split = pair.indexOf("="),
        key = pair.slice(0, split),
        value = pair.slice(split + 1);
      if (value) jar.set(key, value);
      else jar.delete(key);
    }
    return response;
  }
  async function login(value: string) {
    const csrfToken = (await (await asUser("/api/auth/csrf")).json()).csrfToken;
    return asUser("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        csrfToken,
        email,
        password: value,
        callbackUrl: base + "/dashboard",
        json: "true",
      }),
    });
  }
  const path = "/api/admin/users/" + target.id,
    headers = { Origin: base, "Content-Type": "application/json" };
  const patch = (input: object, origin = base) =>
    request(path, {
      method: "PATCH",
      headers: { ...headers, Origin: origin },
      body: JSON.stringify(input),
    });
  let projectId: string | undefined;
  try {
    assert.equal((await login(password)).status, 200);
    assert.equal((await asUser("/api/projects")).status, 200);
    assert.equal(
      (
        await asUser("/api/admin/users/" + actorId, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ isAdmin: false }),
        })
      ).status,
      403,
    );
    assert.equal(
      (await patch({ name: "Changed" }, "https://elsewhere.test")).status,
      403,
    );
    assert.equal(
      (
        await request(path, {
          method: "PATCH",
          headers: { Origin: base, "Content-Type": "text/plain" },
          body: "{}",
        })
      ).status,
      415,
    );
    assert.equal((await patch({ sessionVersion: 100 })).status, 400);
    assert.equal((await patch({ name: "x" })).status, 400);
    assert.equal((await patch({ name: "x".repeat(17000) })).status, 413);
    assert.equal((await patch({ name: "Renamed HTTP account" })).status, 200);
    assert.equal(
      (await (await asUser("/api/auth/session")).json()).user.name,
      "Renamed HTTP account",
    );
    const created = await asUser("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Managed user's shared project" }),
    });
    assert.equal(created.status, 201);
    projectId = (await created.json()).project.id;
    const bytes = Buffer.from("preserved after deleting the uploader");
    const uploaded = await asUser("/api/projects/" + projectId + "/files", {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/octet-stream",
        "X-File-Name": "kept-after-account.txt",
        "X-File-Size": String(bytes.length),
      },
      body: new Uint8Array(bytes),
    });
    assert.equal(uploaded.status, 201);
    const file = (await uploaded.json()).file;
    assert.equal((await patch({ isActive: false })).status, 200);
    assert.equal((await asUser("/api/projects")).status, 401);
    assert.equal(
      (await asUser("/api/projects/" + projectId + "/files/" + file.id)).status,
      401,
    );
    assert.equal((await login(password)).status, 401);
    assert.equal((await patch({ isActive: true })).status, 200);
    assert.equal((await asUser("/api/projects")).status, 401);
    assert.equal((await login(password)).status, 200);
    assert.equal((await patch({ isAdmin: true })).status, 200);
    assert.equal((await asUser("/api/admin")).status, 200);
    assert.equal((await patch({ isAdmin: false })).status, 200);
    assert.equal((await asUser("/api/admin")).status, 403);
    assert.equal(
      (
        await request(path + "/password", {
          method: "POST",
          headers,
          body: JSON.stringify({ password: "short" }),
        })
      ).status,
      400,
    );
    const reset = await request(path + "/password", {
      method: "POST",
      headers,
      body: JSON.stringify({ password: replacement }),
    });
    assert.equal(reset.status, 200);
    const resetBody = await reset.text();
    assert.ok(
      !resetBody.includes(replacement) && !resetBody.includes("passwordHash"),
    );
    assert.equal((await asUser("/api/projects")).status, 401);
    assert.equal((await login(password)).status, 401);
    assert.equal((await login(replacement)).status, 200);
    assert.equal(
      (
        await request(path, {
          method: "DELETE",
          headers,
          body: JSON.stringify({ confirmationEmail: email }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(path, {
          method: "DELETE",
          headers,
          body: JSON.stringify({ confirmationEmail: "wrong@example.com" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(path, {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            confirmationEmail: email,
            transferOwnedProjects: true,
            expectedOwnedProjectCount: 0,
          }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(path, {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            confirmationEmail: email,
            transferOwnedProjects: true,
            expectedOwnedProjectCount: 1,
          }),
        })
      ).status,
      200,
    );
    assert.equal((await asUser("/api/projects")).status, 401);
    assert.equal((await login(replacement)).status, 401);
    assert.equal(await db.user.count({ where: { id: target.id } }), 0);
    assert.equal(await db.project.count({ where: { id: projectId } }), 1);
    assert.equal(
      (await db.projectFile.findUniqueOrThrow({ where: { id: file.id } }))
        .uploaderId,
      null,
    );
    const preserved = await request(
      "/api/projects/" + projectId + "/files/" + file.id,
    );
    assert.equal(preserved.status, 200);
    assert.equal(await preserved.text(), bytes.toString());
    const actor = await db.user.findUniqueOrThrow({
      where: { id: actorId },
      select: { email: true },
    });
    assert.equal(
      (
        await request("/api/admin/users/" + actorId, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ isActive: false }),
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request("/api/admin/users/" + actorId, {
          method: "DELETE",
          headers,
          body: JSON.stringify({ confirmationEmail: actor.email }),
        })
      ).status,
      409,
    );
    console.log(
      "User management HTTP checks passed: access changes, old-session invalidation, password resets, guarded deletion, and preserved shared work.",
    );
  } finally {
    if (projectId) {
      await db.project.deleteMany({ where: { id: projectId } });
      await db.deletionRecord.deleteMany({ where: { projectId } });
    }
    await db.user.deleteMany({ where: { id: target.id } });
  }
}
