import Link from "next/link";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/session";
import { admin } from "@/lib/admin";
import { AdminAccessError } from "@/lib/admin-service";
import { LogoutButton } from "@/components/logout-button";
import { AdminUserControls } from "@/components/admin-user-controls";
export const dynamic = "force-dynamic";
function size(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + " MB"
    : Math.ceil(bytes / 1024) + " KB";
}
const cell = "px-4 py-4 text-left align-top";
const heading = "px-4 py-3 text-left font-semibold";
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const input = Object.fromEntries(
    Object.entries(raw)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  let overview;
  try {
    overview = await admin.overview(user.id, input);
  } catch (error) {
    if (error instanceof AdminAccessError) notFound();
    if (error instanceof ZodError)
      return (
        <section>
          <h1 className="text-3xl font-bold">Invalid search filters</h1>
          <Link
            href="/admin"
            className="mt-4 inline-block text-indigo-700 underline"
          >
            Reset admin search
          </Link>
        </section>
      );
    throw error;
  }
  const { query, counts } = overview;
  const users =
    query.view === "users" ? await admin.users(user.id, query) : null;
  const projects =
    query.view === "projects" ? await admin.projects(user.id, query) : null;
  const files =
    query.view === "files" ? await admin.files(user.id, query) : null;
  const history =
    query.view === "history" ? await admin.history(user.id, query) : null;
  const result = users ?? projects ?? files ?? history!;
  const pageLink = (page: number) => {
    const params = new URLSearchParams({
      view: query.view,
      page: String(page),
    });
    if (query.q) params.set("q", query.q);
    if (query.projectId) params.set("projectId", query.projectId);
    if (query.view === "history") params.set("kind", query.kind);
    return "/admin?" + params;
  };
  return (
    <section className="space-y-6">
      <Link href="/dashboard" className="text-indigo-700 underline">
        Back to your dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 font-semibold text-indigo-700">
            Site administration
          </p>
          <h1 className="text-3xl font-bold">Admin dashboard</h1>
        </div>
        <LogoutButton />
      </div>
      <p className="text-slate-600">
        Review registered accounts and project activity. File downloads here use
        your administrator access.
      </p>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Registered users", counts.users],
          ["Projects", counts.projects],
          ["Available files", counts.files],
          ["Stored file size", size(counts.bytes)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <nav aria-label="Admin sections" className="flex flex-wrap gap-3">
        {(["users", "projects", "files", "history"] as const).map((view) => (
          <Link
            key={view}
            href={"/admin?view=" + view}
            aria-current={view === query.view ? "page" : undefined}
            className={
              "rounded-lg border px-4 py-3 font-semibold " +
              (view === query.view
                ? "border-indigo-700 bg-indigo-700 text-white"
                : "border-slate-300 bg-white text-indigo-700")
            }
          >
            {view === "history"
              ? "Deletion history"
              : view[0].toUpperCase() + view.slice(1)}
          </Link>
        ))}
      </nav>
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <form
          action="/admin"
          method="GET"
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="view" value={query.view} />
          {query.projectId && (
            <input type="hidden" name="projectId" value={query.projectId} />
          )}
          <div className="min-w-0 flex-1">
            <label htmlFor="admin-search" className="mb-2 block font-semibold">
              Search{" "}
              {query.view === "history" ? "deletion history" : query.view}
            </label>
            <input
              id="admin-search"
              name="q"
              defaultValue={query.q}
              maxLength={120}
              placeholder={
                query.view === "history"
                  ? "Deleted name or project name"
                  : query.view === "users"
                    ? "Name or email"
                    : query.view === "projects"
                      ? "Project name or description"
                      : "Filename, project, or uploader email"
              }
            />
          </div>
          {query.view === "history" && (
            <div className="w-48">
              <label
                htmlFor="history-kind"
                className="mb-2 block font-semibold"
              >
                Record type
              </label>
              <select id="history-kind" name="kind" defaultValue={query.kind}>
                <option value="all">Projects and files</option>
                <option value="projects">Projects only</option>
                <option value="files">Files only</option>
              </select>
            </div>
          )}
          <button
            type="submit"
            className="rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white"
          >
            Search
          </button>
          {(query.q ||
            query.projectId ||
            (query.view === "history" && query.kind !== "all")) && (
            <Link
              href={"/admin?view=" + query.view}
              className="px-2 py-3 text-indigo-700 underline"
            >
              Clear filters
            </Link>
          )}
        </form>
        {query.projectId && (
          <p className="mt-4 text-sm text-slate-600">
            Showing {history ? "deletion records" : "files"} in the selected
            project.
          </p>
        )}
        {result.items.length === 0 ? (
          <p className="mt-6 text-slate-600">
            No {query.view === "history" ? "deletion records" : query.view}{" "}
            match these filters.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            {history && (
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Deleted projects and files
                </caption>
                <thead className="bg-slate-50">
                  <tr>
                    {["Type", "Deleted name", "Project", "Deleted on"].map(
                      (h) => (
                        <th scope="col" key={h} className={heading}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {history.items.map((item) => (
                    <tr key={item.id}>
                      <td className={cell}>
                        {item.kind === "PROJECT" ? "Project" : "File"}
                      </td>
                      <td
                        className={cell + " min-w-48 break-all font-semibold"}
                      >
                        {item.name}
                      </td>
                      <td className={cell + " min-w-40 break-words"}>
                        {item.projectName ?? "—"}
                      </td>
                      <td className={cell + " whitespace-nowrap"}>
                        {item.deletedAt.toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {users && (
              <table className="w-full text-sm">
                <caption className="sr-only">Registered users</caption>
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Name",
                      "Email",
                      "Access",
                      "Status",
                      "Projects",
                      "Uploads",
                      "Registered",
                      "Manage",
                    ].map((h) => (
                      <th scope="col" className={heading} key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.items.map((item) => (
                    <tr key={item.id}>
                      <td className={cell + " font-semibold"}>{item.name}</td>
                      <td className={cell + " break-all"}>{item.email}</td>
                      <td className={cell}>
                        {item.isAdmin ? "Administrator" : "User"}
                      </td>
                      <td className={cell}>
                        {item.isActive ? "Active" : "Disabled"}
                      </td>
                      <td className={cell}>{item._count.memberships}</td>
                      <td className={cell}>{item._count.uploads}</td>
                      <td className={cell + " whitespace-nowrap"}>
                        {item.createdAt.toISOString().slice(0, 10)}
                      </td>
                      <td className={cell}>
                        <AdminUserControls
                          key={item.id + ":" + item.name}
                          user={{
                            id: item.id,
                            name: item.name,
                            email: item.email,
                            isAdmin: item.isAdmin,
                            isActive: item.isActive,
                            ownedProjectCount: item.ownedProjectCount,
                          }}
                          currentUserId={user.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {projects && (
              <table className="w-full text-sm">
                <caption className="sr-only">All projects</caption>
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Project",
                      "Owner",
                      "Team",
                      "Tasks",
                      "Files",
                      "Deadline",
                    ].map((h) => (
                      <th scope="col" className={heading} key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {projects.items.map((item) => (
                    <tr key={item.id}>
                      <td className={cell + " min-w-48"}>
                        <p className="break-words font-semibold">{item.name}</p>
                        {item.description && (
                          <p className="mt-2 line-clamp-3 break-words text-slate-600">
                            {item.description}
                          </p>
                        )}
                      </td>
                      <td className={cell}>
                        {item.memberships.map(({ user: owner }) => (
                          <div key={owner.email} className="mb-2">
                            <p>{owner.name}</p>
                            <p className="break-all text-slate-600">
                              {owner.email}
                            </p>
                          </div>
                        ))}
                      </td>
                      <td className={cell}>{item._count.memberships}</td>
                      <td className={cell}>{item._count.tasks}</td>
                      <td className={cell}>
                        <Link
                          href={
                            "/admin?view=files&projectId=" +
                            encodeURIComponent(item.id)
                          }
                          className="text-indigo-700 underline"
                          aria-label={"View files for " + item.name}
                        >
                          {item._count.files} files
                        </Link>
                      </td>
                      <td className={cell + " whitespace-nowrap"}>
                        {item.deadline?.toISOString().slice(0, 10) ??
                          "No deadline"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {files && (
              <table className="w-full text-sm">
                <caption className="sr-only">Uploaded files</caption>
                <thead className="bg-slate-50">
                  <tr>
                    {["File", "Project", "Uploaded by", "Size", "State"].map(
                      (h) => (
                        <th scope="col" className={heading} key={h}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {files.items.map((item) => (
                    <tr key={item.id}>
                      <td className={cell + " min-w-40 break-all"}>
                        {item.state === "READY" ? (
                          <a
                            href={"/api/admin/files/" + item.id}
                            download
                            className="font-semibold text-indigo-700 underline"
                          >
                            {item.name}
                          </a>
                        ) : (
                          item.name
                        )}
                      </td>
                      <td className={cell + " min-w-40 break-words"}>
                        {item.project.name}
                      </td>
                      <td className={cell}>
                        {item.uploader ? (
                          <>
                            <p>{item.uploader.name}</p>
                            <p className="break-all text-slate-600">
                              {item.uploader.email}
                            </p>
                          </>
                        ) : (
                          "Former user"
                        )}
                      </td>
                      <td className={cell + " whitespace-nowrap"}>
                        {size(item.size)}
                      </td>
                      <td className={cell}>
                        {item.state === "READY"
                          ? "Available"
                          : item.state === "PENDING"
                            ? "Uploading"
                            : "Deleting"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
          <p className="text-sm text-slate-600">
            Page {query.page} · {result.total} matching{" "}
            {query.view === "history" ? "deletion records" : query.view}
          </p>
          <nav aria-label="Admin result pages" className="flex gap-5">
            {query.page > 1 && (
              <Link
                href={pageLink(query.page - 1)}
                className="font-semibold text-indigo-700 underline"
              >
                Previous
              </Link>
            )}
            {query.page * result.pageSize < result.total && (
              <Link
                href={pageLink(query.page + 1)}
                className="font-semibold text-indigo-700 underline"
              >
                Next
              </Link>
            )}
          </nav>
        </div>
        {files && (
          <p className="mt-4 text-sm text-slate-600">
            Only available files can be downloaded. Uploading and deleting
            records are included here for visibility.
          </p>
        )}
        {history && (
          <p className="mt-4 text-sm text-slate-600">
            This history keeps names and project context, without file contents.
            It covers deletions recorded since tracking was enabled.
          </p>
        )}
      </div>
    </section>
  );
}
