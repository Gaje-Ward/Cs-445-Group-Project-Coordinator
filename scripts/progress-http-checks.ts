import assert from "node:assert/strict";

type Requester = (route: string, init?: RequestInit) => Promise<Response>;
export async function progressHttpChecks({
  request,
  login,
  projectId,
  ownerEmail,
  memberEmail,
  outsiderEmail,
  base,
}: {
  request: Requester;
  login: (email: string) => Promise<void>;
  projectId: string;
  ownerEmail: string;
  memberEmail: string;
  outsiderEmail: string;
  base: string;
}) {
  const path = "/api/projects/" + projectId + "/tasks";
  const projectPath = "/api/projects/" + projectId;
  const headers = { "Content-Type": "application/json", Origin: base };
  const taskIds: string[] = [];
  const write = (route: string, method: string, input: unknown) =>
    request(route, { method, headers, body: JSON.stringify(input) });
  async function read() {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  const initial = await read();
  assert.deepEqual(initial.progress, {
    total: 0,
    completed: 0,
    remaining: 0,
    todo: 0,
    inProgress: 0,
    overdue: 0,
    percentComplete: 0,
  });
  assert.match(initial.calendar.today, /^\d{4}-\d{2}-\d{2}$/);
  function relativeDay(offset: number) {
    const date = new Date(initial.calendar.today + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }
  const past = relativeDay(-1),
    future = relativeDay(1);
  try {
    for (const input of [
      { title: "Overdue draft", dueDate: past },
      { title: "Finished draft", dueDate: past, status: "DONE" },
      {
        title: "Due today draft",
        dueDate: initial.calendar.today,
        status: "IN_PROGRESS",
      },
      { title: "Undated draft" },
    ]) {
      const created = await write(path, "POST", input);
      assert.equal(created.status, 201);
      taskIds.push((await created.json()).task.id);
    }
    const expected = {
      total: 4,
      completed: 1,
      remaining: 3,
      todo: 2,
      inProgress: 1,
      overdue: 1,
      percentComplete: 25,
    };
    const current = await read();
    assert.deepEqual(current.progress, expected);
    const tampered = await (await request(path + "?today=9999-12-31")).json();
    assert.deepEqual(tampered.progress, expected);
    assert.equal(tampered.calendar.today, current.calendar.today);

    async function dashboardSummary() {
      const response = await request("/api/projects");
      assert.equal(response.status, 200);
      const body = await response.json();
      const project = body.projects.find(
        (entry: { id: string }) => entry.id === projectId,
      );
      assert.ok(project);
      assert.ok(!("tasks" in project));
      assert.equal(body.calendar.today, current.calendar.today);
      return project.progress;
    }
    assert.deepEqual(await dashboardSummary(), expected);
    const page = await (await request("/projects/" + projectId)).text();
    const progressTag = page.match(
      /<progress\b[^>]*aria-label="Project task completion"[^>]*>/,
    )?.[0];
    assert.ok(progressTag && progressTag.includes('value="25"'));
    assert.ok(page.includes("Overdue only"));
    const dashboard = await (await request("/dashboard")).text();
    assert.ok(dashboard.includes("Task completion for HTTP updated project"));

    await login(memberEmail);
    assert.deepEqual((await read()).progress, expected);
    assert.deepEqual(await dashboardSummary(), expected);
    const completed = await write(path + "/" + taskIds[0], "PATCH", {
      status: "DONE",
    });
    assert.equal(completed.status, 200);
    assert.deepEqual((await read()).progress, {
      ...expected,
      completed: 2,
      remaining: 2,
      todo: 1,
      overdue: 0,
      percentComplete: 50,
    });
    assert.equal(
      (
        await write(path + "/" + taskIds[0], "PATCH", {
          status: "TODO",
          dueDate: future,
        })
      ).status,
      200,
    );
    assert.deepEqual((await read()).progress, { ...expected, overdue: 0 });
    assert.equal(
      (await write(path + "/" + taskIds[0], "PATCH", { dueDate: past })).status,
      200,
    );

    await login(outsiderEmail);
    assert.equal((await request(path)).status, 404);
    const unrelated = await (await request("/api/projects")).json();
    assert.ok(
      !unrelated.projects.some(
        (entry: { id: string }) => entry.id === projectId,
      ),
    );

    await login(ownerEmail);
    assert.deepEqual((await read()).progress, expected);
    const original = (await (await request(projectPath)).json()).project;
    assert.equal(
      (
        await write(projectPath, "PATCH", {
          name: original.name,
          description: original.description,
          deadline: past,
        })
      ).status,
      200,
    );
    assert.ok(
      (await (await request("/projects/" + projectId)).text()).includes(
        "Deadline passed",
      ),
    );
    assert.ok(
      (await (await request("/dashboard")).text()).includes("Deadline passed"),
    );
    assert.equal(
      (
        await write(projectPath, "PATCH", {
          name: original.name,
          description: original.description,
          deadline: original.deadline?.slice(0, 10) ?? null,
        })
      ).status,
      200,
    );
    assert.equal(
      (await write(path + "/" + taskIds[0], "DELETE", {})).status,
      200,
    );
    assert.deepEqual((await read()).progress, {
      total: 3,
      completed: 1,
      remaining: 2,
      todo: 1,
      inProgress: 1,
      overdue: 0,
      percentComplete: 33,
    });
    console.log(
      "Progress HTTP checks passed: saved counts, overdue rules, member access, project isolation, and updated summaries.",
    );
  } finally {
    await login(ownerEmail);
    for (const id of taskIds) {
      const response = await write(path + "/" + id, "DELETE", {});
      assert.ok([200, 404].includes(response.status));
    }
  }
  assert.equal((await read()).progress.total, 0);
  assert.equal((await read()).progress.percentComplete, 0);
}
