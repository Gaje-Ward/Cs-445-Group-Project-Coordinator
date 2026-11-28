"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { passwordSchema } from "@/lib/validation";
export function AdminPasswordReset({
  userId,
  userName,
  self,
}: {
  userId: string;
  userName: string;
  self: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (password !== repeat) {
      setError("The new passwords do not match.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that existing sessions will end.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/admin/users/" + userId + "/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Could not reset the password.");
        return;
      }
      setPassword("");
      setRepeat("");
      setConfirmed(false);
      setMessage(
        "Password reset. The user must sign in with the new password.",
      );
      if (self) router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="border-t border-slate-200 pt-3">
      <summary className="cursor-pointer font-semibold">Reset password</summary>
      <form onSubmit={reset} className="mt-3 space-y-3" aria-busy={pending}>
        <p className="text-sm text-slate-600">
          Set a new password for {userName}. Share it with them securely.
        </p>
        <div>
          <label htmlFor={"new-pass-" + userId} className="mb-1 block">
            New password
          </label>
          <input
            id={"new-pass-" + userId}
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
            disabled={pending}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={"repeat-pass-" + userId} className="mb-1 block">
            Confirm new password
          </label>
          <input
            id={"repeat-pass-" + userId}
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
            disabled={pending}
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
          />
        </div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={pending}
            required
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>End existing sessions and reset this password.</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-700 px-3 py-2 font-semibold text-white"
        >
          {pending ? "Resetting…" : "Reset password"}
        </button>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-slate-700">
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
