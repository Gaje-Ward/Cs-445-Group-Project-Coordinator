import Link from "next/link";
import { members } from "@/lib/members";
import { ProjectMembers } from "@/components/project-members";
import { ProjectTasks } from "@/components/project-tasks";
import { tasks } from "@/lib/tasks";
import { requireUser } from "@/lib/session";
import { projects } from "@/lib/projects";
import { ProjectNotFoundError } from "@/lib/project-service";
import { notFound } from "next/navigation";
import { getProjectCalendar } from "@/lib/project-calendar";
import { isPastDate } from "@/lib/project-progress";
import { files } from "@/lib/files";
import { ProjectFiles } from "@/components/project-files";
export const dynamic = "force-dynamic";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const calendar = getProjectCalendar();
  let project;
  let team;
  let projectTasks;
  let projectFiles;
  try {
    project = await projects.get(user.id, id);
    team = await members.list(user.id, id);
    projectTasks = await tasks.list(user.id, id);
    projectFiles = await files.list(user.id, id);
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
        {isPastDate(project.deadline, calendar.today) && (
          <p className="mt-2 text-sm font-semibold text-amber-800">
            Deadline passed
          </p>
        )}
        {project.role === "OWNER" && (
          <Link
            href={`/projects/${project.id}/edit`}
            className="mt-6 inline-block rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
          >
            Edit project
          </Link>
        )}
      </div>
      <ProjectTasks
        projectId={id}
        members={team}
        tasks={projectTasks.map((task) => ({
          ...task,
          dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
        }))}
        canDelete={project.role === "OWNER"}
        today={calendar.today}
        calendarLabel={calendar.label}
      />
      <ProjectFiles
        projectId={id}
        items={projectFiles.map(
          ({ id, name, size, uploaderId, uploaderName }) => ({
            id,
            name,
            size,
            uploaderId,
            uploaderName,
          }),
        )}
        userId={user.id}
        isOwner={project.role === "OWNER"}
      />
      <ProjectMembers
        projectId={id}
        members={team}
        canManage={project.role === "OWNER"}
      />
    </section>
  );
}
