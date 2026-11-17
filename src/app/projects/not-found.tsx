import Link from "next/link";
export default function ProjectNotFound() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold">Project not found</h1>
      <p>This project is unavailable to your account.</p>
      <Link href="/dashboard" className="text-indigo-700 underline">
        Back to projects
      </Link>
    </section>
  );
}
