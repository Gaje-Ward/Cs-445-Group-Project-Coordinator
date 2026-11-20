"use client";
import { useState, type FormEvent } from "react";
import type { taskStatuses } from "@/lib/task-validation";

type Status = (typeof taskStatuses)[number];
export type TaskView = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};
export type TaskMember = { userId: string; name: string };
export const taskStatusLabels: Record<Status, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export function TaskForm({
  projectId,
  task,
  members,
  onSaved,
  onCancel,
}: {
  projectId: string;
  task?: TaskView;
  members: TaskMember[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setFields({});
    try {
      const response = await fetch(
        "/api/projects/" + projectId + "/tasks" + (task ? "/" + task.id : ""),
        {
          method: task ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: input.get("title"),
            description: input.get("description"),
            status: input.get("status"),
            dueDate: input.get("dueDate"),
            assigneeId: input.get("assigneeId"),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Could not save the task. Please try again.");
        setFields(result.fields ?? {});
      } else {
        onSaved();
      }
    } catch {
      setError("Could not connect. Your changes are still in the form.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      aria-labelledby="task-form-heading"
      aria-busy={pending}
      className="mt-6 rounded-lg border border-indigo-200 bg-slate-50 p-4 sm:p-6"
    >
      <h3 id="task-form-heading" className="text-xl font-semibold">
        {task ? "Edit task" : "New task"}
      </h3>
      <fieldset disabled={pending} className="mt-5 space-y-5">
        <div>
          <label htmlFor="task-title" className="mb-2 block font-semibold">
            Task title
          </label>
          <input
            id="task-title"
            name="title"
            defaultValue={task?.title}
            required
            minLength={2}
            maxLength={160}
            aria-invalid={!!fields.title}
            aria-describedby={fields.title ? "task-title-error" : undefined}
          />
          {fields.title && (
            <p id="task-title-error" className="mt-1 text-sm text-red-700">
              {fields.title.join(" ")}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="task-description"
            className="mb-2 block font-semibold"
          >
            Task description (optional)
          </label>
          <textarea
            id="task-description"
            name="description"
            defaultValue={task?.description ?? ""}
            rows={4}
            maxLength={4000}
            aria-invalid={!!fields.description}
            aria-describedby={
              fields.description ? "task-description-error" : undefined
            }
          />
          {fields.description && (
            <p
              id="task-description-error"
              className="mt-1 text-sm text-red-700"
            >
              {fields.description.join(" ")}
            </p>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="task-assignee" className="mb-2 block font-semibold">
              Assigned to
            </label>
            <select
              id="task-assignee"
              name="assigneeId"
              defaultValue={task?.assigneeId ?? ""}
              aria-invalid={!!fields.assigneeId}
              aria-describedby={
                fields.assigneeId ? "task-assignee-error" : undefined
              }
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
            {fields.assigneeId && (
              <p id="task-assignee-error" className="mt-1 text-sm text-red-700">
                {fields.assigneeId.join(" ")}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="task-status" className="mb-2 block font-semibold">
              Task status
            </label>
            <select
              id="task-status"
              name="status"
              defaultValue={task?.status ?? "TODO"}
              aria-invalid={!!fields.status}
              aria-describedby={fields.status ? "task-status-error" : undefined}
            >
              {Object.entries(taskStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {fields.status && (
              <p id="task-status-error" className="mt-1 text-sm text-red-700">
                {fields.status.join(" ")}
              </p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="task-due-date" className="mb-2 block font-semibold">
            Due date (optional)
          </label>
          <input
            id="task-due-date"
            name="dueDate"
            type="date"
            min="0001-01-01"
            max="9999-12-31"
            defaultValue={task?.dueDate?.slice(0, 10) ?? ""}
            aria-invalid={!!fields.dueDate}
            aria-describedby={fields.dueDate ? "task-date-error" : undefined}
          />
          {fields.dueDate && (
            <p id="task-date-error" className="mt-1 text-sm text-red-700">
              {fields.dueDate.join(" ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white">
            {pending ? "Saving…" : task ? "Save task" : "Create task"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-3"
          >
            Cancel
          </button>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
