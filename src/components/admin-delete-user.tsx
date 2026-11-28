"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function AdminDeleteUser({
  userId,
  email,
  ownedProjectCount = 0,
}: {
  userId: string;
  email: string;
  ownedProjectCount?: number;
}) {
  const router = useRouter();
  const [confirmationEmail, setEmail] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [transfer, setTransfer] = useState(false);
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (confirmationEmail.trim().toLowerCase() !== email || !confirmed) {
      setError("Enter the account email and confirm permanent deletion.");
      return;
    }
    if (ownedProjectCount && !transfer) {
      setError(
        "Confirm transfer of the owned projects before deleting the account.",
      );
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/admin/users/" + userId, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationEmail,
          ...(transfer
            ? {
                transferOwnedProjects: true,
                expectedOwnedProjectCount: ownedProjectCount,
              }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Could not delete the account.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="border-t border-slate-200 pt-3">
      <summary className="cursor-pointer font-semibold text-red-700">
        Permanently delete account
      </summary>
      <form onSubmit={remove} className="mt-3 space-y-3" aria-busy={pending}>
        <p className="text-sm">
          This removes the account and its memberships. Shared work stays with
          the projects.
        </p>
        {ownedProjectCount > 0 && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              required
              checked={transfer}
              onChange={(event) => setTransfer(event.target.checked)}
              disabled={pending}
            />
            <span>
              Transfer this account&apos;s {ownedProjectCount} owned{" "}
              {ownedProjectCount === 1 ? "project" : "projects"} to my admin
              account before deletion.
            </span>
          </label>
        )}
        <label htmlFor={"delete-email-" + userId} className="block">
          Type {email} to confirm
        </label>
        <input
          id={"delete-email-" + userId}
          type="email"
          autoComplete="off"
          required
          maxLength={254}
          value={confirmationEmail}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            required
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={pending}
          />
          <span>I understand this account cannot be restored.</span>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-700 px-3 py-2 font-semibold text-white"
        >
          {pending ? "Deleting…" : "Delete account permanently"}
        </button>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
