import Link from "next/link";
export default function Home() {
  return (
    <section className="max-w-3xl py-8">
      <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-700">
        A clearer way to work together
      </p>
      <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
        Keep your group project moving.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
        Group Project Coordinator helps student teams organize their work.
        Create your account today; projects, tasks, and team check-ins will
        arrive in future sprints.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          className="rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white"
          href="/register"
        >
          Create an account
        </Link>
        <Link
          className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold"
          href="/login"
        >
          Log in
        </Link>
      </div>
      <p className="mt-10 text-sm text-slate-500">
        Sprint 1: application foundation and secure authentication.
      </p>
    </section>
  );
}
