"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type InitialProject = {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
};
export function ProjectForm({ project }: { project?: InitialProject }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [savedId, setSavedId] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setFields({});
    setSavedId("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        project ? `/api/projects/${project.id}` : "/api/projects",
        {
          method: project ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.get("name"),
            description: data.get("description"),
            deadline: data.get("deadline"),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Could not save the project. Try again.");
        setFields(result.fields ?? {});
      } else {
        setSavedId(result.project.id);
        router.refresh();
      }
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  if (savedId)
    return (
      <div role="status" className="space-y-4">
        <p>{project ? "Project updated." : "Project created."}</p>
        <Link
          href={`/projects/${savedId}`}
          className="font-semibold text-indigo-700 underline"
        >
          View project
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      <div>
        <label htmlFor="project-name" className="mb-2 block font-semibold">
          Project name
        </label>
        <input
          id="project-name"
          name="name"
          defaultValue={project?.name}
          required
          minLength={2}
          maxLength={120}
          aria-invalid={!!fields.name}
          aria-describedby={fields.name ? "project-name-error" : undefined}
        />
        {fields.name && (
          <p id="project-name-error" className="mt-1 text-sm text-red-700">
            {fields.name.join(" ")}
          </p>
        )}
      </div>
      <div>
        <label
          htmlFor="project-description"
          className="mb-2 block font-semibold"
        >
          Description (optional)
        </label>
        <textarea
          id="project-description"
          name="description"
          defaultValue={project?.description ?? ""}
          rows={5}
          maxLength={2000}
          aria-invalid={!!fields.description}
          aria-describedby="project-description-help project-description-error"
        />
        <p
          id="project-description-help"
          className="mt-1 text-sm text-slate-600"
        >
          Up to 2,000 characters.
        </p>
        <p id="project-description-error" className="mt-1 text-sm text-red-700">
          {fields.description?.join(" ")}
        </p>
      </div>
      <div>
        <label htmlFor="project-deadline" className="mb-2 block font-semibold">
          Deadline (optional)
        </label>
        <input
          id="project-deadline"
          name="deadline"
          type="date"
          defaultValue={project?.deadline ?? ""}
          min="0001-01-01"
          max="9999-12-31"
          aria-invalid={!!fields.deadline}
          aria-describedby="project-deadline-error"
        />
        <p id="project-deadline-error" className="mt-1 text-sm text-red-700">
          {fields.deadline?.join(" ")}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
      >
        {pending ? "Saving…" : project ? "Save changes" : "Create project"}
      </button>
      <Link
        href={project ? `/projects/${project.id}` : "/dashboard"}
        className="inline-block text-indigo-700 underline"
      >
        Cancel
      </Link>
    </form>
  );
}
