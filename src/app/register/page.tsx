import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
export default function Register() {
  return (
    <section className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
      <h1 className="mb-2 text-3xl font-bold">Create your account</h1>
      <p className="mb-6 text-slate-600">
        Start with a secure place for your team.
      </p>
      <AuthForm mode="register" />
      <p className="mt-6 text-sm">
        Already registered?{" "}
        <Link href="/login" className="text-indigo-700 underline">
          Log in
        </Link>
      </p>
    </section>
  );
}
