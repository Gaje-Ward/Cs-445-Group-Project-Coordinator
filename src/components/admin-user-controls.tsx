"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminPasswordReset } from "./admin-password-reset";
import { AdminDeleteUser } from "./admin-delete-user";
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  ownedProjectCount?: number;
};
export function AdminUserControls({
  user,
  currentUserId,
}: {
  user: ManagedUser;
  currentUserId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"role" | "active" | null>(null);
  async function save(change: object) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users/" + user.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error ?? "Could not update the account. Please try again.",
        );
        return;
      }
      setConfirm(null);
      setMessage("Account updated.");
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save({ name });
  }
  const self = user.id === currentUserId;
  return (
    <details className="min-w-64 max-w-sm">
      <summary className="cursor-pointer font-semibold text-indigo-700">
        Manage user<span className="sr-only"> {user.name}</span>
      </summary>
      <div
        className="mt-4 space-y-4 rounded-lg border border-slate-200 p-4"
        aria-busy={pending}
      >
        <form onSubmit={rename} className="space-y-2">
          <label
            className="block font-semibold"
            htmlFor={"user-name-" + user.id}
          >
            Display name
          </label>
          <input
            id={"user-name-" + user.id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={80}
            required
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            Save name
          </button>
        </form>
        {self ? (
          <p className="text-sm text-slate-600">
            This is your account. Access changes are protected to prevent
            self-lockout.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirm("active");
                setError("");
                setMessage("");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {user.isActive ? "Disable account" : "Reactivate account"}
            </button>
            <button
              type="button"
              disabled={pending || (!user.isActive && !user.isAdmin)}
              onClick={() => {
                setConfirm("role");
                setError("");
                setMessage("");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {user.isAdmin ? "Remove admin access" : "Grant admin access"}
            </button>
          </div>
        )}
        {confirm && (
          <div className="space-y-3 rounded-lg bg-slate-50 p-3">
            <p>
              {confirm === "role"
                ? user.isAdmin
                  ? "Remove administrator access from " + user.name + "?"
                  : "Grant administrator access to " +
                    user.name +
                    "? They will be able to view all users and download any project's files."
                : user.isActive
                  ? "Disable " +
                    user.name +
                    "? Existing sessions will end. Their work stays available to the team."
                  : "Reactivate " +
                    user.name +
                    "? They can sign in again." +
                    (user.isAdmin
                      ? " Administrator access will also be restored."
                      : "")}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void save(
                    confirm === "role"
                      ? { isAdmin: !user.isAdmin }
                      : { isActive: !user.isActive },
                  )
                }
                className="rounded-lg bg-indigo-700 px-3 py-2 font-semibold text-white"
              >
                {pending ? "Saving…" : "Confirm change"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirm(null)}
                className="px-2 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <AdminPasswordReset userId={user.id} userName={user.name} self={self} />
        {!self && (
          <AdminDeleteUser
            key={user.ownedProjectCount ?? 0}
            userId={user.id}
            email={user.email}
            ownedProjectCount={user.ownedProjectCount ?? 0}
          />
        )}
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
      </div>
    </details>
  );
}
