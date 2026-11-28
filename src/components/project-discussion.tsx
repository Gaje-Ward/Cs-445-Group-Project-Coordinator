"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { COMMENT_MAX_LENGTH } from "@/lib/comment-validation";
export type CommentView = {
  id: string;
  body: string;
  authorId: string | null;
  authorName: string;
  version: number;
  createdAt: string;
  createdLabel: string;
  updatedAt: string;
  updatedLabel: string;
};
type DiscussionPage = {
  items: CommentView[];
  page: number;
  pageCount: number;
  total: number;
};
export function ProjectDiscussion({
  projectId,
  userId,
  canModerate,
  data,
  requestedPage = 1,
  ideasPage = 1,
  calendarLabel,
}: {
  projectId: string;
  userId: string;
  canModerate: boolean;
  data: DiscussionPage;
  requestedPage?: number;
  ideasPage?: number;
  calendarLabel: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(""),
    [editDraft, setEditDraft] = useState("");
  const [editing, setEditing] = useState<CommentView | null>(null),
    [deleting, setDeleting] = useState<CommentView | null>(null);
  const [pending, setPending] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false);
  const path = "/api/projects/" + projectId + "/comments";
  const busy = !!pending || editing !== null || deleting !== null;
  const ideaQuery = ideasPage > 1 ? "&ideasPage=" + ideasPage : "";
  async function change(
    method: "POST" | "PATCH" | "DELETE",
    id: string,
    input: object,
  ) {
    setPending(id || "new");
    setError("");
    setMessage("");
    setConflict(false);
    try {
      const response = await fetch(path + (id ? "/" + id : ""), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.fields?.body?.[0] ??
            result.error ??
            "Could not save the comment. Please try again.",
        );
        setConflict(response.status === 409 || response.status === 404);
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
    if (!draft.trim()) {
      setError("Write a comment before posting.");
      return;
    }
    if (await change("POST", "", { body: draft })) {
      setDraft("");
      setMessage("Comment posted.");
      if (requestedPage !== 1)
        router.push(
          "/projects/" +
            projectId +
            "?commentsPage=1" +
            ideaQuery +
            "#project-discussion",
        );
      else router.refresh();
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    if (!editDraft.trim()) {
      setError("Write a comment before saving.");
      return;
    }
    if (
      await change("PATCH", editing.id, {
        body: editDraft,
        version: editing.version,
      })
    ) {
      setEditing(null);
      setEditDraft("");
      setMessage("Comment updated.");
      router.refresh();
    }
  }
  async function remove() {
    if (
      deleting &&
      (await change("DELETE", deleting.id, { version: deleting.version }))
    ) {
      setDeleting(null);
      setMessage("Comment deleted.");
      router.refresh();
    }
  }
  function refreshDiscussion() {
    setEditing(null);
    setDeleting(null);
    setEditDraft("");
    setConflict(false);
    setError("");
    router.refresh();
  }
  function beginEdit(comment: CommentView) {
    setEditing(comment);
    setEditDraft(comment.body);
    setError("");
    setMessage("");
    setConflict(false);
  }
  return (
    <section
      id="project-discussion"
      aria-labelledby="discussion-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 id="discussion-heading" className="text-2xl font-semibold">
        Discussion
      </h2>
      <p className="mt-3 text-slate-600">
        Keep project decisions and questions here.
      </p>
      <form
        onSubmit={post}
        className="mt-5 space-y-3"
        aria-busy={pending === "new"}
      >
        <label htmlFor="new-comment" className="block font-semibold">
          Add a comment
        </label>
        <textarea
          id="new-comment"
          rows={4}
          required
          maxLength={COMMENT_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
          aria-describedby="comment-help"
        />
        <p id="comment-help" className="text-sm text-slate-600">
          Plain text, up to {COMMENT_MAX_LENGTH.toLocaleString("en-US")}{" "}
          characters.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
        >
          {pending === "new" ? "Posting…" : "Post comment"}
        </button>
        {(editing || deleting) && (
          <p className="text-sm text-slate-600">
            Finish or cancel the current action before posting.
          </p>
        )}
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
      {conflict && (
        <button
          type="button"
          onClick={refreshDiscussion}
          disabled={!!pending}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-2"
        >
          {editing ? "Discard edit and refresh" : "Refresh discussion"}
        </button>
      )}
      {data.items.length === 0 ? (
        <p className="mt-6 text-slate-600">
          No comments yet. Start the discussion above.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {data.items.map((comment) => (
            <li
              key={comment.id}
              className="rounded-lg border border-slate-200 p-4 sm:p-5"
              aria-busy={pending === comment.id}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="break-words font-semibold">
                  {comment.authorName}
                </p>
                <time
                  className="text-sm text-slate-600"
                  dateTime={comment.createdAt}
                >
                  {comment.createdLabel}
                </time>
              </div>
              {editing?.id === comment.id ? (
                <form onSubmit={save} className="mt-4 space-y-3">
                  <label
                    htmlFor={"edit-comment-" + comment.id}
                    className="block font-semibold"
                  >
                    Edit comment
                  </label>
                  <textarea
                    id={"edit-comment-" + comment.id}
                    rows={4}
                    required
                    maxLength={COMMENT_MAX_LENGTH}
                    disabled={!!pending}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                  />
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={!!pending}
                      className="rounded-lg bg-indigo-700 px-3 py-2 font-semibold text-white"
                    >
                      {pending === comment.id ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      disabled={!!pending}
                      onClick={() => {
                        setEditing(null);
                        setEditDraft("");
                        setConflict(false);
                        setError("");
                      }}
                      className="px-3 py-2"
                    >
                      Cancel edit
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-3 whitespace-pre-wrap break-words">
                  {comment.body}
                </p>
              )}
              {comment.version > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  Edited{" "}
                  <time dateTime={comment.updatedAt}>
                    {comment.updatedLabel}
                  </time>
                </p>
              )}
              {deleting?.id === comment.id ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p>Delete this comment?</p>
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() => void remove()}
                    className="rounded-lg border border-red-300 px-3 py-2 text-red-700"
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() => {
                      setDeleting(null);
                      setConflict(false);
                      setError("");
                    }}
                    className="px-3 py-2"
                  >
                    Cancel delete
                  </button>
                </div>
              ) : (
                editing?.id !== comment.id && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {comment.authorId === userId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => beginEdit(comment)}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      >
                        Edit
                      </button>
                    )}
                    {(comment.authorId === userId || canModerate) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setDeleting(comment);
                          setError("");
                          setMessage("");
                          setConflict(false);
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-600">
        <p>
          {data.total} {data.total === 1 ? "comment" : "comments"} · Page{" "}
          {data.page} of {data.pageCount}
        </p>
        <nav aria-label="Discussion pages" className="flex gap-5">
          {data.page > 1 &&
            (!busy ? (
              <Link
                href={
                  "/projects/" +
                  projectId +
                  "?commentsPage=" +
                  (data.page - 1) +
                  ideaQuery +
                  "#project-discussion"
                }
                className="font-semibold text-indigo-700 underline"
              >
                Newer comments
              </Link>
            ) : (
              <span aria-disabled="true">Newer comments</span>
            ))}
          {data.page < data.pageCount &&
            (!busy ? (
              <Link
                href={
                  "/projects/" +
                  projectId +
                  "?commentsPage=" +
                  (data.page + 1) +
                  ideaQuery +
                  "#project-discussion"
                }
                className="font-semibold text-indigo-700 underline"
              >
                Older comments
              </Link>
            ) : (
              <span aria-disabled="true">Older comments</span>
            ))}
        </nav>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Times shown in {calendarLabel}. You can edit your own comments. Project
        owners can also remove comments.
      </p>
    </section>
  );
}
