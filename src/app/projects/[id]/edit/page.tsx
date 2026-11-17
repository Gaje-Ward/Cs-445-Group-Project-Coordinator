import { requireUser } from "@/lib/session";
import { projects } from "@/lib/projects";
import { ProjectNotFoundError } from "@/lib/project-service";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/project-form";
export const dynamic = "force-dynamic";
export default async function EditProject({
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
  if (project.role !== "OWNER") notFound();
  return (
    <section className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <h1 className="mb-6 text-3xl font-bold">Edit project</h1>
      <ProjectForm
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          deadline: project.deadline?.toISOString().slice(0, 10) ?? null,
        }}
      />
    </section>
  );
}
