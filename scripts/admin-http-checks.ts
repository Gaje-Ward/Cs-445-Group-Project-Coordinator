import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "../src/generated/prisma/client";
import { userManagementHttpChecks } from "./user-management-http-checks";
export async function adminHttpChecks({
  request,
  csrf,
  db,
  base,
  ownerId,
  storageRoot,
}: {
  request: (route: string, init?: RequestInit) => Promise<Response>;
  csrf: () => Promise<string>;
  db: PrismaClient;
  base: string;
  ownerId: string;
  storageRoot: string;
}) {
  const marker = "Admin HTTP " + randomUUID(),
    email = "admin-fixture-" + randomUUID() + "@example.com";
  const privateUser = await db.user.create({
    data: { name: marker, email, passwordHash: "private-test-hash" },
    select: { id: true },
  });
  let projectId: string | undefined;
  const historyProjectIds: string[] = [];
  const key = randomUUID();
  try {
    const project = await db.project.create({
      data: {
        name: marker,
        description: "Foreign project for admin review",
        memberships: { create: { userId: privateUser.id, role: "OWNER" } },
      },
      select: { id: true },
    });
    projectId = project.id;
    const bytes = Buffer.from("Admin-only fixture download");
    await writeFile(join(storageRoot, key + ".blob"), bytes);
    const disk = await db.projectFile.create({
      data: {
        projectId,
        name: "admin-disk.txt",
        size: bytes.length,
        mediaType: "text/plain",
        storageKey: key,
        uploaderId: privateUser.id,
      },
      select: { id: true },
    });
    const legacy = await db.projectFile.create({
      data: {
        projectId,
        name: "admin-legacy.txt",
        size: bytes.length,
        mediaType: "text/plain",
        data: bytes,
        uploaderId: privateUser.id,
      },
      select: { id: true },
    });
    assert.equal((await request("/api/admin")).status, 403);
    assert.equal((await request("/api/admin/files/" + disk.id)).status, 403);
    const deniedPage = await (await request("/admin")).text();
    assert.ok(!deniedPage.includes(email));
    assert.ok(!deniedPage.includes("Foreign project for admin review"));
    const update = await request("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({
        csrfToken: await csrf(),
        data: { isAdmin: true, user: { id: ownerId, isAdmin: true } },
      }),
    });
    assert.equal(update.status, 200);
    assert.equal((await request("/api/admin")).status, 403);
    assert.equal(
      (
        await request("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: base },
          body: JSON.stringify({
            name: "Fake admin",
            email: randomUUID() + "@example.com",
            password: "a long registration passphrase",
            isAdmin: true,
          }),
        })
      ).status,
      400,
    );
    await db.user.update({ where: { id: ownerId }, data: { isAdmin: true } });
    const users = await request(
      "/api/admin?view=users&q=" + encodeURIComponent(email),
    );
    assert.equal(users.status, 200);
    assert.match(users.headers.get("cache-control")!, /no-store/);
    const userList = await users.json();
    assert.equal(userList.total, 1);
    assert.ok(!("passwordHash" in userList.items[0]));
    const projects = await request(
      "/api/admin?view=projects&q=" + encodeURIComponent(marker),
    );
    assert.equal(projects.status, 200);
    const projectList = await projects.json();
    assert.equal(projectList.total, 1);
    assert.equal(projectList.items[0]._count.files, 2);
    const list = await request("/api/admin?view=files&projectId=" + projectId);
    assert.equal(list.status, 200);
    const fileList = await list.json();
    assert.equal(fileList.total, 2);
    assert.ok(
      fileList.items.every(
        (file: object) => !("data" in file) && !("storageKey" in file),
      ),
    );
    for (const id of [disk.id, legacy.id]) {
      const download = await request("/api/admin/files/" + id);
      assert.equal(download.status, 200);
      assert.equal(await download.text(), bytes.toString());
      assert.match(download.headers.get("content-disposition")!, /attachment/);
    }
    for (const route of [
      "/admin?q=" + encodeURIComponent(email),
      "/admin?view=projects&q=" + encodeURIComponent(marker),
      "/admin?view=files&projectId=" + projectId,
    ]) {
      const page = await request(route);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.ok(html.includes("Admin dashboard"));
      assert.ok(
        html.includes(
          route.includes("view=files")
            ? "admin-disk.txt"
            : route.includes("view=projects")
              ? marker
              : email,
        ),
      );
      assert.ok(!html.includes("private-test-hash"));
    }
    assert.ok(
      (await (await request("/dashboard")).text()).includes('href="/admin"'),
    );
    assert.equal(
      (await request("/api/projects/" + projectId + "/files/" + disk.id))
        .status,
      404,
    );
    assert.equal((await request("/api/admin?view=files&page=0")).status, 400);
    assert.equal((await request("/api/admin?isAdmin=true")).status, 400);
    assert.equal((await request("/api/admin/files/missing")).status, 404);
    await userManagementHttpChecks({ request, db, base, actorId: ownerId });
    const historyName = "Deleted HTTP project " + randomUUID();
    const deletedProject = await db.project.create({
      data: {
        name: historyName,
        memberships: { create: { userId: ownerId, role: "OWNER" } },
      },
      select: { id: true },
    });
    historyProjectIds.push(deletedProject.id);
    const fileRoute = "/api/projects/" + deletedProject.id + "/files";
    const uploaded = await request(fileRoute, {
      method: "POST",
      headers: {
        Origin: base,
        "Content-Type": "application/octet-stream",
        "X-File-Name": "deleted-http-notes.txt",
        "X-File-Size": String(bytes.length),
      },
      body: new Uint8Array(bytes),
    });
    assert.equal(uploaded.status, 201);
    const deletedFile = (await uploaded.json()).file;
    assert.equal(
      (
        await request(fileRoute + "/" + deletedFile.id, {
          method: "DELETE",
          headers: { Origin: base, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/api/admin/files/" + deletedFile.id)).status,
      404,
    );
    await db.project.delete({ where: { id: deletedProject.id } });
    const historyPath =
      "/api/admin?view=history&projectId=" + deletedProject.id;
    const history = await request(historyPath);
    assert.equal(history.status, 200);
    const deleted = await history.json();
    assert.equal(deleted.total, 2);
    assert.ok(
      deleted.items.some((item: { name: string }) => item.name === historyName),
    );
    assert.ok(
      deleted.items.some(
        (item: { name: string }) => item.name === "deleted-http-notes.txt",
      ),
    );
    assert.ok(
      deleted.items.every(
        (item: object) =>
          !("data" in item) && !("storageKey" in item) && !("sourceId" in item),
      ),
    );
    assert.equal(
      (await (await request(historyPath + "&kind=projects")).json()).total,
      1,
    );
    assert.equal(
      (await (await request(historyPath + "&kind=files")).json()).total,
      1,
    );
    const historyPage = await request(
      "/admin?view=history&projectId=" + deletedProject.id,
    );
    assert.equal(historyPage.status, 200);
    const historyHtml = await historyPage.text();
    assert.ok(
      historyHtml.includes("Deletion history") &&
        historyHtml.includes(historyName) &&
        historyHtml.includes("deleted-http-notes.txt"),
    );
    assert.ok(
      !historyHtml.includes('href="/api/admin/files/' + deletedFile.id + '"'),
    );
    await db.user.update({ where: { id: ownerId }, data: { isAdmin: false } });
    assert.equal((await request(historyPath)).status, 403);
    assert.equal((await request("/api/admin")).status, 403);
    assert.equal((await request("/api/admin/files/" + disk.id)).status, 403);
    assert.ok(
      !(await (await request("/dashboard")).text()).includes('href="/admin"'),
    );
    console.log(
      "Admin HTTP checks passed: safe listings, cross-project downloads, denied ordinary accounts, and immediate grant/revoke checks.",
    );
  } finally {
    await db.user.updateMany({
      where: { id: ownerId },
      data: { isAdmin: false },
    });
    const fixtureProjects = [
      ...historyProjectIds,
      ...(projectId ? [projectId] : []),
    ];
    await db.project.deleteMany({ where: { id: { in: fixtureProjects } } });
    await db.deletionRecord.deleteMany({
      where: { projectId: { in: fixtureProjects } },
    });
    await db.user.deleteMany({ where: { id: privateUser.id } });
    await unlink(join(storageRoot, key + ".blob")).catch(() => {});
  }
}
