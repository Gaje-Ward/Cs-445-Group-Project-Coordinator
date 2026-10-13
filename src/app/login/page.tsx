import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <h1 className="mb-2 text-3xl font-bold">Welcome back</h1>
      <p className="mb-6 text-slate-600">Log in to your workspace.</p>
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          Login was unsuccessful. Please try again.
        </p>
      )}
      <AuthForm mode="login" />
      <p className="mt-6 text-sm">
        New here?{" "}
        <Link href="/register" className="text-indigo-700 underline">
          Create an account
        </Link>
      </p>
    </section>
  );
}
