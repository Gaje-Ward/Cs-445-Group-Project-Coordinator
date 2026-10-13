import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { testDatabaseUrl } from "./test-database";
async function main() {
  const databaseUrl = testDatabaseUrl();
  const base = "http://localhost:3001";
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const email = "http-" + randomUUID() + "@example.com";
  const input = {
    name: "HTTP Smoke Student",
    email,
    password: "a long smoke test passphrase",
  };
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3001",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NEXTAUTH_URL: base,
        NEXTAUTH_SECRET: randomBytes(32).toString("base64"),
      },
    },
  );
  let failedToStart = false;
  server.on("error", () => {
    failedToStart = true;
  });
  const jar = new Map<string, string>();
  async function request(route: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (jar.size)
      headers.set(
        "Cookie",
        [...jar].map(([key, value]) => key + "=" + value).join("; "),
      );
    const response = await fetch(base + route, {
      ...init,
      headers,
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const split = pair.indexOf("=");
      const key = pair.slice(0, split);
      const value = pair.slice(split + 1);
      if (value) jar.set(key, value);
      else jar.delete(key);
    }
    return response;
  }
  async function csrf() {
    const response = await request("/api/auth/csrf");
    assert.equal(response.status, 200);
    return (await response.json()).csrfToken as string;
  }
  async function protectedRedirect() {
    const response = await request("/dashboard");
    const body = await response.text();
    const location = response.headers.get("location");
    assert.ok(
      location?.includes("/login") ||
        (/NEXT_REDIRECT|http-equiv="refresh"/.test(body) &&
          body.includes("/login")),
    );
    assert.ok(!body.includes("Welcome, HTTP Smoke Student"));
  }
  const jsonHeaders = { "Content-Type": "application/json", Origin: base };
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (failedToStart || server.exitCode !== null)
        throw new Error("Test server exited before startup.");
      try {
        const response = await fetch(base);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Test server must start");
    await protectedRedirect();
    assert.equal((await request("/api/auth/session")).status, 200);
    assert.deepEqual(await (await request("/api/auth/session")).json(), {});
    assert.equal(
      (
        await request("/api/register", {
          method: "POST",
          headers: { ...jsonHeaders, Origin: "https://other.example" },
          body: JSON.stringify(input),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/register", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ ...input, password: "short" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/register", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ ...input, role: "admin" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/register", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ ...input, name: "x".repeat(5000) }),
        })
      ).status,
      413,
    );
    const registered = await request("/api/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input),
    });
    assert.equal(registered.status, 201);
    const identity = (await registered.json()).user;
    assert.deepEqual(Object.keys(identity).sort(), ["email", "id", "name"]);
    assert.equal(
      (
        await request("/api/register", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(input),
        })
      ).status,
      409,
    );
    async function login(password: string) {
      return request("/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: base,
        },
        body: new URLSearchParams({
          csrfToken: await csrf(),
          email,
          password,
          callbackUrl: base + "/dashboard",
          json: "true",
        }),
      });
    }
    assert.equal((await login("an incorrect long passphrase")).status, 401);
    const loggedIn = await login(input.password);
    assert.equal(loggedIn.status, 200);
    const session = await (await request("/api/auth/session")).json();
    assert.equal(session.user.id, identity.id);
    assert.equal(session.user.email, email);
    assert.ok(!JSON.stringify(session).includes("passwordHash"));
    const dashboard = await request("/dashboard");
    assert.equal(dashboard.status, 200);
    assert.ok((await dashboard.text()).includes("HTTP Smoke Student"));
    const update = await request("/api/auth/session", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        csrfToken: await csrf(),
        data: {
          user: { id: "attacker", email: "attacker@example.com" },
          email: "attacker@example.com",
          name: "Attacker",
        },
      }),
    });
    assert.equal(update.status, 200);
    const unchanged = await update.json();
    assert.equal(unchanged.user.id, identity.id);
    assert.equal(unchanged.user.email, email);
    const csrfToken = await csrf();
    const signedOut = await request("/api/auth/signout", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: base,
      },
      body: new URLSearchParams({ csrfToken, callbackUrl: base, json: "true" }),
    });
    assert.equal(signedOut.status, 200);
    assert.deepEqual(await (await request("/api/auth/session")).json(), {});
    await protectedRedirect();
    assert.equal((await request("/nonexistent-page")).status, 404);
    console.log(
      "HTTP smoke checks passed: registration, validation, duplicate email, login, logout, protected dashboard, session safety, origin/body limits, and 404.",
    );
  } finally {
    try {
      await db.user.deleteMany({ where: { email } });
    } finally {
      await db.$disconnect();
      if (server.exitCode === null) {
        const exited = once(server, "exit");
        server.kill();
        await exited;
      }
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
