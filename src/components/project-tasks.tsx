"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isTaskOverdue, summarizeTasks } from "@/lib/project-progress";
import { ProjectProgress } from "./project-progress";
import {
  TaskForm,
  taskStatusLabels,
  type TaskView,
  type TaskMember,
} from "./task-form";

export function ProjectTasks({
  projectId,
  tasks,
  members,
  canDelete,
  today,
  calendarLabel,
}: {
  projectId: string;
  tasks: TaskView[];
  members: TaskMember[];
  canDelete: boolean;
  today: string;
  calendarLabel?: string;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<TaskView | "new" | null>(null);
  const [confirmId, setConfirmId] = useState("");
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const progress = summarizeTasks(tasks, today);
  const visibleTasks = overdueOnly
    ? tasks.filter((task) => isTaskOverdue(task, today))
    : tasks;

  function edit(task: TaskView | "new") {
    if (task === "new") setOverdueOnly(false);
    setEditor(task);
    setConfirmId("");
    setError("");
    setMessage("");
  }
  async function change(
    task: TaskView,
    method: "PATCH" | "DELETE",
    input: object,
  ) {
    setPending(task.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        "/api/projects/" + projectId + "/tasks/" + task.id,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error ?? "Could not update the task. Please try again.",
        );
        return;
      }
      setMessage(
        method === "DELETE" ? "Task deleted." : "Task status updated.",
      );
      setConfirmId("");
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending("");
    }
  }

  return (
    <section
      aria-labelledby="tasks-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tasks-heading" className="text-2xl font-semibold">
          Tasks
        </h2>
        <button
          type="button"
          disabled={!!pending || editor !== null}
          onClick={() => edit("new")}
          className="rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
        >
          Add task
        </button>
      </div>
      <ProjectProgress progress={progress} label="Project task completion" />
      {calendarLabel && (
        <p className="mt-2 text-sm text-slate-600">
          Due dates follow {calendarLabel}.
        </p>
      )}
      {tasks.length > 0 && (
        <label className="mt-4 flex w-fit items-center gap-2 whitespace-nowrap text-sm font-semibold">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => setOverdueOnly(event.target.checked)}
            className="h-4 w-4 shrink-0 p-0 accent-indigo-700"
          />
          Overdue only
        </label>
      )}
      {editor !== null && (
        <TaskForm
          key={editor === "new" ? "new" : editor.id}
          projectId={projectId}
          members={members}
          task={editor === "new" ? undefined : editor}
          onCancel={() => setEditor(null)}
          onSaved={() => {
            setMessage(editor === "new" ? "Task created." : "Task updated.");
            setEditor(null);
            router.refresh();
          }}
        />
      )}
      {tasks.length === 0 ? (
        <p className="mt-6 text-slate-600">
          No tasks yet. Add one to start planning the work.
        </p>
      ) : visibleTasks.length === 0 ? (
        <p className="mt-6 text-slate-600">No overdue tasks.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {visibleTasks.map((task) => (
            <li
              key={task.id}
              className={
                "rounded-lg border p-4 sm:p-5 " +
                (isTaskOverdue(task, today)
                  ? "border-amber-300 bg-amber-50/30"
                  : "border-slate-200")
              }
              aria-busy={pending === task.id}
            >
              <h3 className="break-words text-lg font-semibold">
                {task.title}
              </h3>
              {isTaskOverdue(task, today) && (
                <p className="mt-2 text-sm font-semibold text-amber-800">
                  Overdue
                </p>
              )}
              {task.description && (
                <p className="mt-2 whitespace-pre-wrap break-words text-slate-600">
                  {task.description}
                </p>
              )}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold">Assigned to</dt>
                  <dd className="break-words">
                    {task.assigneeName ?? "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Due date</dt>
                  <dd>{task.dueDate?.slice(0, 10) ?? "No due date"}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 sm:max-w-48">
                  <label
                    htmlFor={"status-" + task.id}
                    className="mb-1 block text-sm font-semibold"
                  >
                    Status
                  </label>
                  <select
                    id={"status-" + task.id}
                    aria-label={"Status for " + task.title}
                    value={task.status}
                    disabled={!!pending || editor !== null}
                    onChange={(event) =>
                      void change(task, "PATCH", { status: event.target.value })
                    }
                  >
                    {Object.entries(taskStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={!!pending || editor !== null}
                  onClick={() => edit(task)}
                  aria-label={"Edit " + task.title}
                  className="rounded-lg border border-slate-300 px-4 py-3"
                >
                  Edit
                </button>
                {canDelete && (
                  <button
                    type="button"
                    disabled={!!pending || editor !== null}
                    aria-label={"Delete " + task.title}
                    onClick={() => {
                      setConfirmId(task.id);
                      setMessage("");
                      setError("");
                    }}
                    className="rounded-lg border border-red-200 px-4 py-3 text-red-700"
                  >
                    Delete
                  </button>
                )}
              </div>
              {canDelete && confirmId === task.id && (
                <div className="mt-4 rounded-lg bg-red-50 p-3">
                  <p className="break-words">
                    Delete {task.title}? This cannot be undone.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={!!pending}
                      onClick={() => void change(task, "DELETE", {})}
                      className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
                    >
                      {pending === task.id ? "Deleting…" : "Confirm deletion"}
                    </button>
                    <button
                      type="button"
                      disabled={!!pending}
                      onClick={() => setConfirmId("")}
                      className="rounded-lg border border-slate-300 px-4 py-2"
                    >
                      Cancel deletion
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!canDelete && (
        <p className="mt-5 text-sm text-slate-600">
          Everyone on the team can update tasks. Only the project owner can
          delete them.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-indigo-800">
          {message}
        </p>
      )}
    </section>
  );
}
