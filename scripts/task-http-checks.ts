import assert from "node:assert/strict";

type Requester = (route: string, init?: RequestInit) => Promise<Response>;
export async function taskHttpChecks({
  request,
  login,
  projectId,
  otherProjectId,
  ownerEmail,
  member,
  outsider,
  base,
}: {
  request: Requester;
  login: (email: string) => Promise<void>;
  projectId: string;
  otherProjectId: string;
  ownerEmail: string;
  member: { id: string; email: string };
  outsider: { id: string; email: string };
  base: string;
}) {
  const path = "/api/projects/" + projectId + "/tasks";
  const headers = { "Content-Type": "application/json", Origin: base };
  const write = (route: string, method: string, body: unknown, origin = base) =>
    request(route, {
      method,
      headers: { ...headers, Origin: origin },
      body: JSON.stringify(body),
    });
  assert.deepEqual((await (await request(path)).json()).tasks, []);
  const input = {
    title: "HTTP task draft",
    description: "Task notes",
    dueDate: "2026-12-10",
    assigneeId: member.id,
  };
  for (const invalid of [
    { ...input, title: " " },
    { ...input, title: "x".repeat(161) },
    { ...input, status: "INVALID" },
    { ...input, dueDate: "2026-02-30" },
    { ...input, projectId: otherProjectId },
    { ...input, role: "OWNER" },
    { ...input, assigneeProjectId: otherProjectId },
  ])
    assert.equal((await write(path, "POST", invalid)).status, 400);
  assert.equal(
    (await write(path, "POST", input, "https://other.example")).status,
    403,
  );
  assert.equal(
    (await write(path, "POST", { ...input, description: "x".repeat(17000) }))
      .status,
    413,
  );
  assert.equal(
    (await write(path, "POST", { ...input, assigneeId: outsider.id })).status,
    409,
  );
  const created = await write(path, "POST", input);
  assert.equal(created.status, 201);
  const task = (await created.json()).task;
  assert.equal(task.assigneeId, member.id);
  assert.equal(task.dueDate, "2026-12-10T00:00:00.000Z");
  assert.ok(!("assigneeProjectId" in task) && !("assignee" in task));
  const taskPath = path + "/" + task.id;
  assert.equal((await write(taskPath, "PATCH", {})).status, 400);
  assert.equal(
    (
      await request(taskPath, {
        method: "PATCH",
        headers: { Origin: base },
        body: "{}",
      })
    ).status,
    415,
  );
  assert.equal(
    (await request(taskPath, { method: "PATCH", headers, body: "{" })).status,
    400,
  );
  assert.equal(
    (await write(taskPath, "DELETE", {}, "https://other.example")).status,
    403,
  );
  const rosterPage = await (await request("/projects/" + projectId)).text();
  assert.ok(
    rosterPage.includes(input.title) &&
      rosterPage.includes('aria-label="Delete HTTP task draft"'),
  );

  await login(member.email);
  const listing = await request(path);
  assert.equal(listing.status, 200);
  assert.equal(listing.headers.get("cache-control"), "no-store");
  assert.equal((await listing.json()).tasks.length, 1);
  const memberPage = await (await request("/projects/" + projectId)).text();
  assert.ok(
    memberPage.includes(input.title) &&
      !memberPage.includes('aria-label="Delete HTTP task draft"'),
  );
  const addedByMember = await write(path, "POST", { title: "Member task" });
  assert.equal(addedByMember.status, 201);
  const memberTask = (await addedByMember.json()).task;
  const progress = await write(taskPath, "PATCH", { status: "IN_PROGRESS" });
  assert.equal(progress.status, 200);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries((await progress.json()).task).filter(([key]) =>
        ["title", "status", "assigneeId", "dueDate"].includes(key),
      ),
    ),
    {
      title: input.title,
      status: "IN_PROGRESS",
      assigneeId: member.id,
      dueDate: "2026-12-10T00:00:00.000Z",
    },
  );
  assert.equal(
    (await write(taskPath, "PATCH", { status: "DONE" })).status,
    200,
  );
  assert.equal(
    (
      await write(taskPath, "PATCH", {
        title: "Revised task",
        description: "",
        dueDate: "",
      })
    ).status,
    200,
  );
  assert.equal((await write(taskPath, "DELETE", {})).status, 404);
  assert.equal(
    (await write(taskPath, "PATCH", { assigneeId: outsider.id })).status,
    409,
  );

  await login(outsider.email);
  assert.equal((await request(path)).status, 404);
  assert.equal((await write(path, "POST", input)).status, 404);
  assert.equal(
    (await write(taskPath, "PATCH", { status: "TODO" })).status,
    404,
  );
  assert.equal((await write(taskPath, "DELETE", {})).status, 404);
  const hidden = await write(
    "/api/projects/" + otherProjectId + "/tasks",
    "POST",
    { title: "Unrelated private task" },
  );
  assert.equal(hidden.status, 201);
  const hiddenId = (await hidden.json()).task.id;

  await login(ownerEmail);
  const wrongProject = await write(path + "/" + hiddenId, "PATCH", {
    status: "DONE",
  });
  const missingTask = await write(path + "/missing", "PATCH", {
    status: "DONE",
  });
  assert.equal(wrongProject.status, 404);
  assert.deepEqual(await wrongProject.json(), await missingTask.json());
  assert.equal((await write(path + "/" + hiddenId, "DELETE", {})).status, 404);
  const removed = await write(
    "/api/projects/" + projectId + "/members",
    "DELETE",
    { userId: member.id },
  );
  assert.equal(removed.status, 200);
  const unassigned = (await (await request(path)).json()).tasks.find(
    (entry: { id: string }) => entry.id === task.id,
  );
  assert.equal(unassigned.assigneeId, null);
  assert.equal(unassigned.assigneeName, null);
  assert.equal(unassigned.title, "Revised task");

  await login(member.email);
  assert.equal((await request(path)).status, 404);
  assert.deepEqual(
    (await (await request("/api/projects")).json()).projects,
    [],
  );
  assert.equal(
    (await write(taskPath, "PATCH", { status: "TODO" })).status,
    404,
  );
  assert.equal(
    (await write(path, "POST", { title: "After removal" })).status,
    404,
  );

  await login(ownerEmail);
  assert.equal((await write(taskPath, "DELETE", {})).status, 200);
  assert.equal((await write(taskPath, "DELETE", {})).status, 404);
  const remaining = (await (await request(path)).json()).tasks;
  assert.deepEqual(
    remaining.map((entry: { id: string }) => entry.id),
    [memberTask.id],
  );
  assert.equal(
    (await write(path + "/" + memberTask.id, "DELETE", {})).status,
    200,
  );
  console.log(
    "Task HTTP checks passed: member workflow, owner deletion, project isolation, same-project assignment, and access after removal.",
  );
}
