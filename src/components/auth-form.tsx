"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const register = mode === "register";
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setFields({});
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      if (register) {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            password: data.get("password"),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Could not register. Try again.");
          setFields(result.fields ?? {});
        } else {
          form.reset();
          setSuccess(true);
        }
      } else {
        const result = await signIn("credentials", {
          email: data.get("email"),
          password: data.get("password"),
          redirect: false,
          callbackUrl: "/dashboard",
        });
        if (result?.ok && !result.error) {
          router.push("/dashboard");
          router.refresh();
        } else
          setError(
            "Unable to log in. Check your email and password, or wait before trying again.",
          );
      }
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  if (success)
    return (
      <div role="status">
        <p>Your account is ready.</p>
        <Link
          href="/login"
          className="mt-4 inline-block font-semibold text-indigo-700 underline"
        >
          Continue to login
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-5">
      {register && (
        <div>
          <label htmlFor="name" className="mb-2 block font-semibold">
            Name
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            aria-invalid={!!fields.name}
            aria-describedby={fields.name ? "name-error" : undefined}
          />
          {fields.name && (
            <p id="name-error" className="mt-1 text-sm text-red-700">
              {fields.name.join(" ")}
            </p>
          )}
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-2 block font-semibold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          aria-invalid={!!fields.email}
          aria-describedby={fields.email ? "email-error" : undefined}
        />
        {fields.email && (
          <p id="email-error" className="mt-1 text-sm text-red-700">
            {fields.email.join(" ")}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          required
          minLength={12}
          maxLength={72}
          aria-invalid={!!fields.password}
          aria-describedby="password-help password-error"
        />
        <p id="password-help" className="mt-2 text-sm text-slate-600">
          Use 12–72 characters, at most 72 UTF-8 bytes. A long, unique
          passphrase works well.
        </p>
        <p id="password-error" className="mt-1 text-sm text-red-700">
          {fields.password?.join(" ")}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
      >
        {pending ? "Please wait…" : register ? "Create account" : "Log in"}
      </button>
    </form>
  );
}
