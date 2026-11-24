// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { TaskForm, type TaskView } from "@/components/task-form";
import { ProjectTasks } from "@/components/project-tasks";

const members = [
  { userId: "owner", name: "Morgan" },
  { userId: "member", name: "Casey" },
];
const task: TaskView = {
  id: "t1",
  title: "Draft report",
  description: "Outline the findings",
  status: "TODO",
  dueDate: "2026-12-05",
  assigneeId: "member",
  assigneeName: "Casey",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("marks only unfinished past-due work and filters the list without changing tasks", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const items: TaskView[] = [
    { ...task, id: "late", title: "Late draft", dueDate: "2026-11-21" },
    { ...task, id: "today", title: "Due today", dueDate: "2026-11-22" },
    {
      ...task,
      id: "done",
      title: "Finished draft",
      status: "DONE",
      dueDate: "2026-11-20",
    },
    { ...task, id: "undated", title: "Undated draft", dueDate: null },
  ];
  render(
    <ProjectTasks
      projectId="p1"
      members={members}
      tasks={items}
      canDelete
      today="2026-11-22"
      calendarLabel="Central Time"
    />,
  );
  expect(screen.getByText("1 of 4 tasks completed")).toBeVisible();
  expect(screen.getByText("1 overdue")).toBeVisible();
  expect(screen.getAllByText("Overdue", { exact: true })).toHaveLength(1);
  expect(screen.getByText("Due dates follow Central Time.")).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "Overdue only" }));
  expect(screen.getByRole("heading", { name: "Late draft" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Due today" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Finished draft" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Undated draft" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("1 of 4 tasks completed")).toBeVisible();
  await user.click(screen.getByRole("checkbox", { name: "Overdue only" }));
  expect(screen.getByRole("heading", { name: "Due today" })).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});

it("updates the summary from refreshed task props and handles an empty overdue filter", async () => {
  const overdueTask = { ...task, dueDate: "2026-11-21" };
  const view = render(
    <ProjectTasks
      projectId="p1"
      members={members}
      tasks={[overdueTask]}
      canDelete
      today="2026-11-22"
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("checkbox", { name: "Overdue only" }));
  view.rerender(
    <ProjectTasks
      projectId="p1"
      members={members}
      tasks={[{ ...overdueTask, status: "DONE" }]}
      canDelete
      today="2026-11-22"
    />,
  );
  expect(screen.getByText("1 of 1 task completed")).toBeVisible();
  expect(screen.getByText("100%")).toBeVisible();
  expect(screen.getByText("No overdue tasks.")).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Draft report" }),
  ).not.toBeInTheDocument();
});

it("clears the overdue filter when starting a new task so the new work is not hidden", async () => {
  render(
    <ProjectTasks
      projectId="p1"
      members={members}
      tasks={[task]}
      canDelete
      today="2026-11-22"
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "Overdue only" }));
  expect(screen.getByText("No overdue tasks.")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Add task" }));
  expect(
    screen.getByRole("checkbox", { name: "Overdue only" }),
  ).not.toBeChecked();
  expect(screen.getByLabelText("Task title")).toBeVisible();
});
function savedResponse() {
  return { ok: true, json: async () => ({ task: { id: "t1" } }) };
}

it("creates a task with a selected teammate and date without sending identity fields", async () => {
  const fetcher = vi.fn().mockResolvedValue(savedResponse());
  const onSaved = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <TaskForm
      projectId="p1"
      members={members}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Task title"), "Draft report");
  await user.type(
    screen.getByLabelText("Task description (optional)"),
    "Write findings",
  );
  await user.selectOptions(screen.getByLabelText("Assigned to"), "member");
  await user.type(screen.getByLabelText("Due date (optional)"), "2026-12-05");
  await user.click(screen.getByRole("button", { name: "Create task" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][0]).toBe("/api/projects/p1/tasks");
  expect(fetcher.mock.calls[0][1].method).toBe("POST");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    title: "Draft report",
    description: "Write findings",
    status: "TODO",
    dueDate: "2026-12-05",
    assigneeId: "member",
  });
});

it("prefills editing and allows clearing an assignment and optional details", async () => {
  const fetcher = vi.fn().mockResolvedValue(savedResponse());
  const onSaved = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <TaskForm
      projectId="p1"
      members={members}
      task={task}
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Task title")).toHaveValue("Draft report");
  expect(screen.getByLabelText("Due date (optional)")).toHaveValue(
    "2026-12-05",
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Task description (optional)"));
  await user.clear(screen.getByLabelText("Due date (optional)"));
  await user.selectOptions(screen.getByLabelText("Assigned to"), "");
  await user.selectOptions(screen.getByLabelText("Task status"), "DONE");
  await user.click(screen.getByRole("button", { name: "Save task" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[0][0]).toBe("/api/projects/p1/tasks/t1");
  expect(fetcher.mock.calls[0][1].method).toBe("PATCH");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    assigneeId: "",
    description: "",
    dueDate: "",
    status: "DONE",
  });
});

it("disables form controls while saving and exposes server field feedback", async () => {
  let finish!: (response: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(
    <TaskForm
      projectId="p1"
      members={members}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Task title"), "  ");
  await user.click(screen.getByRole("button", { name: "Create task" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByLabelText("Assigned to")).toBeDisabled();
  finish({
    ok: false,
    json: async () => ({
      error: "Please check your input.",
      fields: { title: ["Use at least 2 characters."] },
    }),
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Please check your input.",
  );
  expect(screen.getByLabelText("Task title")).toHaveAccessibleDescription(
    "Use at least 2 characters.",
  );
  expect(screen.getByLabelText("Task title")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

it("preserves entered work after an offline failure or a stale assignee conflict", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "Choose someone who is still a member of this project.",
      }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(
    <TaskForm
      projectId="p1"
      members={members}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Task title"), "Keep this draft");
  await user.click(screen.getByRole("button", { name: "Create task" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not connect",
  );
  expect(screen.getByLabelText("Task title")).toHaveValue("Keep this draft");
  await user.click(screen.getByRole("button", { name: "Create task" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("still a member");
  expect(screen.getByLabelText("Task title")).toHaveValue("Keep this draft");
});

it("opens and cancels the empty-list task form without making a request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <ProjectTasks
      today="2026-11-22"
      projectId="p1"
      members={members}
      tasks={[]}
      canDelete
    />,
  );
  expect(screen.getByText(/No tasks yet/)).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add task" }));
  expect(screen.getByLabelText("Task title")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

it("allows member editing and status changes but hides deletion controls", async () => {
  const fetcher = vi.fn().mockResolvedValue(savedResponse());
  vi.stubGlobal("fetch", fetcher);
  render(
    <ProjectTasks
      today="2026-11-22"
      projectId="p1"
      members={members}
      tasks={[task]}
      canDelete={false}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Delete Draft report" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Edit Draft report" }),
  ).toBeEnabled();
  await userEvent
    .setup()
    .selectOptions(
      screen.getByLabelText("Status for Draft report"),
      "IN_PROGRESS",
    );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Task status updated.",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    status: "IN_PROGRESS",
  });
  expect(refresh).toHaveBeenCalledOnce();
});

it("shows status failures without claiming success or refreshing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Project not found." }),
    }),
  );
  render(
    <ProjectTasks
      today="2026-11-22"
      projectId="p1"
      members={members}
      tasks={[task]}
      canDelete
    />,
  );
  await userEvent
    .setup()
    .selectOptions(screen.getByLabelText("Status for Draft report"), "DONE");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Project not found.",
  );
  expect(screen.getByLabelText("Status for Draft report")).toHaveValue("TODO");
  expect(refresh).not.toHaveBeenCalled();
});

it("requires owner confirmation before deletion and supports cancellation", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ removed: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(
    <ProjectTasks
      today="2026-11-22"
      projectId="p1"
      members={members}
      tasks={[task]}
      canDelete
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Delete Draft report" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel deletion" }));
  expect(
    screen.queryByRole("button", { name: "Confirm deletion" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Delete Draft report" }));
  await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Task deleted.");
  expect(fetcher.mock.calls[0][1].method).toBe("DELETE");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({});
  expect(refresh).toHaveBeenCalledOnce();
});

it("opens the selected task editor and shows saved feedback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(savedResponse()));
  render(
    <ProjectTasks
      today="2026-11-22"
      projectId="p1"
      members={members}
      tasks={[task]}
      canDelete
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Edit Draft report" }));
  expect(screen.getByLabelText("Task title")).toHaveValue("Draft report");
  expect(screen.getByLabelText("Status for Draft report")).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Save task" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Task updated.");
  expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
});
