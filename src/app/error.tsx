"use client";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <section role="alert">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="my-4">
        Please try again. If the problem continues, check that the database is
        running.
      </p>
      <button
        onClick={retry}
        className="rounded-lg bg-indigo-700 px-4 py-2 text-white"
      >
        Try again
      </button>
    </section>
  );
}
