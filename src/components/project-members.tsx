"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Member = { userId: string; name: string; role: "OWNER" | "MEMBER" };
export function ProjectMembers({
  projectId,
  members,
  canManage,
}: {
  projectId: string;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmId, setConfirmId] = useState("");

  async function change(method: "POST" | "DELETE", input: object, key: string) {
    setPending(key);
    setError("");
    setEmailError("");
    setMessage("");
    try {
      const response = await fetch("/api/projects/" + projectId + "/members", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error ?? "Could not update the team. Please try again.",
        );
        setEmailError(result.fields?.email?.join(" ") ?? "");
        return false;
      }
      setMessage(method === "POST" ? "Teammate added." : "Teammate removed.");
      setConfirmId("");
      router.refresh();
      return true;
    } catch {
      setError("Could not connect. Please try again.");
      return false;
    } finally {
      setPending("");
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    if (await change("POST", { email }, "add")) form.reset();
  }

  return (
    <section
      aria-labelledby="team-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 id="team-heading" className="text-2xl font-semibold">
        Team
      </h2>
      <ul className="mt-5 divide-y divide-slate-200">
        {members.map((member) => (
          <li key={member.userId} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-semibold">{member.name}</p>
                <p className="text-sm text-slate-600">
                  {member.role === "OWNER" ? "Owner" : "Member"}
                </p>
              </div>
              {canManage &&
                member.role === "MEMBER" &&
                confirmId !== member.userId && (
                  <button
                    type="button"
                    disabled={!!pending}
                    aria-label={"Remove " + member.name}
                    onClick={() => {
                      setConfirmId(member.userId);
                      setMessage("");
                      setError("");
                    }}
                    className="rounded-lg border border-red-200 px-4 py-2 text-red-700"
                  >
                    Remove
                  </button>
                )}
            </div>
            {canManage && confirmId === member.userId && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="break-words">
                  Remove {member.name} from this project? They will lose access.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() =>
                      void change(
                        "DELETE",
                        { userId: member.userId },
                        member.userId,
                      )
                    }
                    className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
                  >
                    {pending === member.userId
                      ? "Removing…"
                      : "Confirm removal"}
                  </button>
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() => setConfirmId("")}
                    className="rounded-lg border border-slate-300 px-4 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          onSubmit={add}
          className="mt-6 border-t border-slate-200 pt-6"
          aria-busy={!!pending}
        >
          <label htmlFor="teammate-email" className="mb-2 block font-semibold">
            Teammate email
          </label>
          <p id="teammate-help" className="mb-3 text-sm text-slate-600">
            Your teammate needs an account before you can add them.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="teammate-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              disabled={!!pending}
              aria-invalid={!!emailError}
              aria-describedby={
                "teammate-help" + (emailError ? " teammate-email-error" : "")
              }
              className="min-w-0 flex-1"
            />
            <button
              disabled={!!pending}
              className="shrink-0 rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
            >
              {pending === "add" ? "Adding…" : "Add teammate"}
            </button>
          </div>
          {emailError && (
            <p id="teammate-email-error" className="mt-2 text-sm text-red-700">
              {emailError}
            </p>
          )}
        </form>
      ) : (
        <p className="mt-5 text-sm text-slate-600">
          Only the project owner can add or remove teammates.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-indigo-800">
          {message}
        </p>
      )}
    </section>
  );
}
