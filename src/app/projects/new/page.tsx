import { requireUser } from "@/lib/session";
import { ProjectForm } from "@/components/project-form";
export const dynamic = "force-dynamic";
export default async function NewProject() {
  await requireUser();
  return (
    <section className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <h1 className="mb-6 text-3xl font-bold">Create project</h1>
      <ProjectForm />
    </section>
  );
}
