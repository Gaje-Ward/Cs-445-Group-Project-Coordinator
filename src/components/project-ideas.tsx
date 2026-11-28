"use client";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ideaSchema } from "@/lib/idea-validation";
export type IdeaView = {
  id: string;
  title: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  createdLabel: string;
  voteCount: number;
  voted: boolean;
};
type IdeaPage = {
  items: IdeaView[];
  total: number;
  page: number;
  pageCount: number;
};
export function ProjectIdeas({
  projectId,
  userId,
  isOwner,
  data,
  requestedPage = 1,
  discussionPage = 1,
  calendarLabel,
}: {
  projectId: string;
  userId: string;
  isOwner: boolean;
  data: IdeaPage;
  requestedPage?: number;
  discussionPage?: number;
  calendarLabel: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const [pending, setPending] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<IdeaView | null>(null);
  const [refreshing, startTransition] = useTransition();
  const busy = !!pending || refreshing;
  const path = "/api/projects/" + projectId + "/ideas";
  function pageLink(page: number) {
    return (
      "/projects/" +
      projectId +
      "?ideasPage=" +
      page +
      "&commentsPage=" +
      discussionPage +
      "#project-ideas"
    );
  }
  function refresh() {
    startTransition(() => router.refresh());
  }
  async function change(
    method: string,
    suffix: string,
    input: object,
    key: string,
  ) {
    setPending(key);
    setError("");
    setMessage("");
    try {
      const response = await fetch(path + suffix, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.fields?.title?.[0] ??
            result.fields?.body?.[0] ??
            result.error ??
            "Could not save your changes. Try again.",
        );
        return false;
      }
      return true;
    } catch {
      setError("Could not connect. Your text has been kept; please try again.");
      return false;
    } finally {
      setPending("");
    }
  }
  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = ideaSchema.safeParse({ title, body });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (await change("POST", "", parsed.data, "new")) {
      setTitle("");
      setBody("");
      setMessage("Idea posted.");
      if (requestedPage !== 1) startTransition(() => router.push(pageLink(1)));
      else refresh();
    }
  }
  async function vote(idea: IdeaView) {
    if (
      await change(
        "PUT",
        "/" + idea.id + "/vote",
        { voted: !idea.voted },
        idea.id,
      )
    ) {
      setMessage(idea.voted ? "Vote removed." : "Vote added.");
      refresh();
    }
  }
  async function remove() {
    if (
      deleting &&
      (await change("DELETE", "/" + deleting.id, {}, deleting.id))
    ) {
      setDeleting(null);
      setMessage("Idea deleted.");
      refresh();
    }
  }
  return (
    <section
      id="project-ideas"
      aria-labelledby="ideas-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 id="ideas-heading" className="text-2xl font-semibold">
        Ideas
      </h2>
      <p className="mt-3 text-slate-600">
        Propose an approach and vote for the ideas you support. Each member gets
        one vote per idea.
      </p>
      <form
        onSubmit={post}
        className="mt-5 space-y-3"
        aria-busy={pending === "new"}
      >
        <label htmlFor="idea-title" className="block font-semibold">
          Idea title
        </label>
        <input
          id="idea-title"
          required
          minLength={2}
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy || !!deleting}
        />
        <label htmlFor="idea-description" className="block font-semibold">
          Describe your idea
        </label>
        <textarea
          id="idea-description"
          required
          rows={3}
          maxLength={4000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy || !!deleting}
          aria-describedby="idea-help"
        />
        <p id="idea-help" className="text-sm text-slate-600">
          Plain text, up to 4,000 characters. Posted ideas cannot be edited once
          submitted.
        </p>
        <button
          type="submit"
          disabled={busy || !!deleting}
          className="rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
        >
          {pending === "new" ? "Posting…" : "Post idea"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-4 text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-slate-700">
          {message}
        </p>
      )}
      {data.items.length === 0 ? (
        <p className="mt-6 text-slate-600">No ideas yet. Share one above.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {data.items.map((idea) => (
            <li
              key={idea.id}
              className="rounded-lg border border-slate-200 p-4 sm:p-5"
              aria-busy={pending === idea.id}
            >
              <h3 className="break-words text-lg font-semibold">
                {idea.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                <span className="break-words">{idea.authorName}</span> ·{" "}
                <time dateTime={idea.createdAt}>{idea.createdLabel}</time>
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words">
                {idea.body}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="font-semibold">
                  {idea.voteCount} {idea.voteCount === 1 ? "vote" : "votes"}
                </p>
                <button
                  type="button"
                  aria-pressed={idea.voted}
                  onClick={() => void vote(idea)}
                  disabled={busy || !!deleting}
                  className="rounded-lg border border-indigo-300 px-3 py-2 font-semibold text-indigo-700"
                >
                  {idea.voted ? "Remove vote" : "Vote"}
                </button>
                {(idea.authorId === userId || isOwner) &&
                  deleting?.id !== idea.id && (
                    <button
                      type="button"
                      disabled={busy || !!deleting}
                      onClick={() => {
                        setDeleting(idea);
                        setError("");
                        setMessage("");
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2"
                    >
                      Delete idea
                    </button>
                  )}
              </div>
              {deleting?.id === idea.id && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p>Delete this idea and its votes?</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove()}
                    className="rounded-lg border border-red-300 px-3 py-2 text-red-700"
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDeleting(null);
                      setError("");
                    }}
                    className="px-3 py-2"
                  >
                    Cancel delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-600">
        <p>
          {data.total} {data.total === 1 ? "idea" : "ideas"} · Page {data.page}{" "}
          of {data.pageCount}
        </p>
        <nav aria-label="Idea pages" className="flex gap-5">
          {data.page > 1 &&
            (!busy && !deleting ? (
              <Link
                href={pageLink(data.page - 1)}
                className="font-semibold text-indigo-700 underline"
              >
                Newer ideas
              </Link>
            ) : (
              <span aria-disabled="true">Newer ideas</span>
            ))}
          {data.page < data.pageCount &&
            (!busy && !deleting ? (
              <Link
                href={pageLink(data.page + 1)}
                className="font-semibold text-indigo-700 underline"
              >
                Older ideas
              </Link>
            ) : (
              <span aria-disabled="true">Older ideas</span>
            ))}
        </nav>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Times shown in {calendarLabel}. Refresh to see other members’ votes.
      </p>
    </section>
  );
}
