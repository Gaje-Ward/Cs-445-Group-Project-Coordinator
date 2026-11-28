"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  FILE_ACCEPT,
  MAX_FILE_BYTES,
  PROJECT_FILE_BYTES,
} from "@/lib/file-validation";

export type FileView = {
  id: string;
  name: string;
  size: number;
  uploaderId: string | null;
  uploaderName: string;
};
export function ProjectFiles({
  projectId,
  items,
  userId,
  isOwner,
}: {
  projectId: string;
  items: FileView[];
  userId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const used = items.reduce((sum, file) => sum + file.size, 0);
  const route = "/api/projects/" + projectId + "/files";
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const file = input.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!file.size || file.size > MAX_FILE_BYTES) {
      setError("Choose a non-empty file, 512 MB or smaller.");
      return;
    }
    setPending(true);
    setUploading(true);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const response = await fetch(route, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Size": String(file.size),
        },
        body: file,
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error ?? "Could not upload the file. Please try again.",
        );
        return;
      }
      if (input.current) input.current.value = "";
      setMessage("File uploaded.");
      router.refresh();
    } catch {
      if (controller.signal.aborted) setMessage("Upload cancelled.");
      else
        setError(
          "Could not connect. Your file is still selected; please try again.",
        );
    } finally {
      setPending(false);
      setUploading(false);
      uploadController.current = null;
    }
  }
  async function remove(id: string) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(route + "/" + id, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.error ?? "Could not delete the file. Please try again.",
        );
        return;
      }
      setConfirmId("");
      setMessage("File deleted.");
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      aria-labelledby="files-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <h2 id="files-heading" className="text-2xl font-semibold">
        Files
      </h2>
      <p className="mt-3 text-sm text-slate-600">
        Share project documents and images. PDF, TXT, PNG, JPEG, ZIP, or DOCX;
        up to 512 MB per file.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        {(used / 1024 / 1024).toFixed(1)} MB of{" "}
        {PROJECT_FILE_BYTES / 1024 / 1024 / 1024} GB used · {items.length} of
        100 files
      </p>
      <form onSubmit={upload} className="mt-5 space-y-3" aria-busy={pending}>
        <label htmlFor="project-file" className="block font-semibold">
          Choose file
        </label>
        <input
          ref={input}
          id="project-file"
          type="file"
          accept={FILE_ACCEPT}
          disabled={pending}
          aria-describedby="file-privacy"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
        >
          {pending ? "Please wait…" : "Upload file"}
        </button>
      </form>
      {uploading && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="status">Uploading… Keep this page open.</p>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2"
            onClick={() => uploadController.current?.abort()}
          >
            Cancel upload
          </button>
        </div>
      )}
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
      {items.length === 0 ? (
        <p className="mt-6 text-slate-600">No files yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200">
          {items.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <a
                  href={route + "/" + file.id}
                  className="break-all font-semibold text-indigo-700 underline"
                  download
                >
                  {file.name}
                </a>
                <p className="mt-1 text-sm text-slate-600">
                  {file.size >= 1024 * 1024
                    ? (file.size / 1024 / 1024).toFixed(1) + " MB"
                    : Math.ceil(file.size / 1024) + " KB"}{" "}
                  · Uploaded by {file.uploaderName}
                </p>
              </div>
              {(isOwner || file.uploaderId === userId) &&
                (confirmId === file.id ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span>Delete this file?</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(file.id)}
                      className="rounded-lg border border-red-300 px-3 py-2 text-red-700"
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirmId("")}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={"Delete " + file.name}
                    onClick={() => setConfirmId(file.id)}
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  >
                    Delete
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      <p id="file-privacy" className="mt-5 text-sm text-slate-600">
        Only current project members can download files. You can delete your
        uploads; the owner can delete any file. Files are downloaded rather than
        previewed.
      </p>
    </section>
  );
}
