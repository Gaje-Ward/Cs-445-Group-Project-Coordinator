import Link from "next/link";
export default function NotFound() {
  return (
    <section>
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="my-4">This page could not be found.</p>
      <Link href="/" className="text-indigo-700 underline">
        Return home
      </Link>
    </section>
  );
}
