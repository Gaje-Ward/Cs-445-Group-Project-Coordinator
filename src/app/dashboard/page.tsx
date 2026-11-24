import Link from "next/link";
import { requireUser } from "@/lib/session";
import { projects } from "@/lib/projects";
import { LogoutButton } from "@/components/logout-button";
import { ProjectProgress } from "@/components/project-progress";
import { getProjectCalendar } from "@/lib/project-calendar";
import { isPastDate } from "@/lib/project-progress";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const user = await requireUser();
  const calendar = getProjectCalendar();
  const items = await projects.list(user.id, calendar.today);
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-indigo-700">
            Your workspace
          </p>
          <h1 className="text-3xl font-bold">Welcome, {user.name}.</h1>
        </div>
        <LogoutButton />
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">Your projects</h2>
        <Link
          href="/projects/new"
          className="rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
        >
          Create project
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8">
          <h3 className="text-xl font-semibold">No projects yet</h3>
          <p className="mt-3 text-slate-600">
            Create your first project to get started.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {items.map((project) => (
            <li
              key={project.id}
              className="min-w-0 rounded-xl border border-slate-200 bg-white p-6"
            >
              <h3 className="break-words text-xl font-semibold">
                <Link
                  href={`/projects/${project.id}`}
                  className="text-indigo-700 underline"
                >
                  {project.name}
                </Link>
              </h3>
              <p className="mt-3 break-words text-slate-600">
                {project.description ?? "No description yet."}
              </p>
              <p className="mt-4 text-sm">
                {project.deadline
                  ? `Deadline: ${project.deadline.toISOString().slice(0, 10)}`
                  : "No deadline set."}
              </p>
              {isPastDate(project.deadline, calendar.today) && (
                <p className="mt-1 text-sm font-semibold text-amber-800">
                  Deadline passed
                </p>
              )}
              <ProjectProgress
                progress={project.progress}
                label={"Task completion for " + project.name}
                compact
              />
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <p className="mt-5 text-sm text-slate-600">
          Due dates follow {calendar.label}.
        </p>
      )}
    </section>
  );
}
