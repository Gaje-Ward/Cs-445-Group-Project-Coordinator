import { requireUser } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const user = await requireUser();
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
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold">You’re ready to get started</h2>
        <p className="mt-3 leading-7 text-slate-600">
          Your account is set up. Project membership, tasks, and deadlines are
          planned for Sprint 2. Check-ins and project health will follow.
        </p>
      </div>
    </section>
  );
}
