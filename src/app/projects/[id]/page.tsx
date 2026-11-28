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
import { comments } from "@/lib/comments";
import { commentPageSchema } from "@/lib/comment-validation";
import { ProjectDiscussion } from "@/components/project-discussion";
export const dynamic = "force-dynamic";
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const calendar = getProjectCalendar();
  const query = await searchParams;
  const parsedPage = commentPageSchema.safeParse(
    typeof query.commentsPage === "string" ? query.commentsPage : 1,
  );
  const requestedCommentPage = parsedPage.success ? parsedPage.data : 1;
  const formatCommentTime = new Intl.DateTimeFormat("en-US", {
    timeZone: calendar.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  let project;
  let team;
  let projectTasks;
  let projectFiles;
  let discussion;
  try {
    project = await projects.get(user.id, id);
    team = await members.list(user.id, id);
    projectTasks = await tasks.list(user.id, id);
    projectFiles = await files.list(user.id, id);
    discussion = await comments.list(user.id, id, requestedCommentPage);
  } catch (error) {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-6">
      <Link href="/dashboard" className="text-indigo-700 underline">
        Back to projects
      </Link>
      <div className="project-workspace">
        <div className="min-w-0 space-y-6">
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
                Edit or rename project
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
        </div>
        <aside
          className="project-discussion-sidebar min-w-0"
          aria-label="Project discussion"
        >
          <ProjectDiscussion
            projectId={id}
            userId={user.id}
            canModerate={project.role === "OWNER"}
            requestedPage={requestedCommentPage}
            calendarLabel={calendar.label}
            data={{
              ...discussion,
              items: discussion.items.map((comment) => ({
                ...comment,
                createdAt: comment.createdAt.toISOString(),
                updatedAt: comment.updatedAt.toISOString(),
                createdLabel: formatCommentTime.format(comment.createdAt),
                updatedLabel: formatCommentTime.format(comment.updatedAt),
              })),
            }}
          />
        </aside>
      </div>
    </section>
  );
}
