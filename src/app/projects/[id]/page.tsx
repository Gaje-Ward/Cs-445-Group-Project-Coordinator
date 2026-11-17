import Link from "next/link";
import { requireUser } from "@/lib/session";
import { projects } from "@/lib/projects";
import { ProjectNotFoundError } from "@/lib/project-service";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  let project;
  try {
    project = await projects.get(user.id, id);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-6">
      <Link href="/dashboard" className="text-indigo-700 underline">
        Back to projects
      </Link>
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="mb-2 text-sm font-semibold text-indigo-700">
          {project.role === "OWNER" ? "Owner" : "Member"}
        </p>
        <h1 className="break-words text-3xl font-bold">{project.name}</h1>
        <p className="mt-5 whitespace-pre-wrap break-words text-slate-600">
          {project.description ?? "No description yet."}
        </p>
        <dl className="mt-6">
          <dt className="font-semibold">Deadline</dt>
          <dd className="mt-1">
            {project.deadline
              ? project.deadline.toISOString().slice(0, 10)
              : "No deadline set."}
          </dd>
        </dl>
        {project.role === "OWNER" && (
          <Link
            href={`/projects/${project.id}/edit`}
            className="mt-6 inline-block rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
          >
            Edit project
          </Link>
        )}
      </div>
    </section>
  );
}
