// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh, push } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
import {
  ProjectDiscussion,
  type CommentView,
} from "@/components/project-discussion";
const comment: CommentView = {
  id: "c1",
  body: "Original note",
  authorId: "member",
  authorName: "Casey",
  version: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  createdLabel: "Posted earlier",
  updatedLabel: "Updated later",
};
const data = { items: [comment], page: 1, pageCount: 1, total: 1 };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("renders plain text, author/times, and member-only controls", () => {
  const { container } = render(
    <ProjectDiscussion
      projectId="p1"
      userId="peer"
      canModerate={false}
      calendarLabel="Central Time"
      data={{
        ...data,
        items: [{ ...comment, body: "<img src=x onerror=alert(1)>" }],
      }}
    />,
  );
  expect(screen.getByText("Casey")).toBeVisible();
  expect(screen.getByText("Posted earlier")).toHaveAttribute(
    "dateTime",
    comment.createdAt,
  );
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
  expect(container.querySelector("img")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Delete" }),
  ).not.toBeInTheDocument();
});
it("lets owners moderate another author's comment without editing it", () => {
  render(
    <ProjectDiscussion
      projectId="p1"
      userId="owner"
      canModerate
      calendarLabel="Central Time"
      data={data}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Edit" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
});
it("posts text, refreshes, and clears the successful draft", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  render(
    <ProjectDiscussion
      projectId="p1"
      userId="member"
      canModerate={false}
      calendarLabel="Central Time"
      data={{ ...data, items: [], total: 0 }}
    />,
  );
  await user.type(screen.getByLabelText("Add a comment"), "New project note");
  await user.click(screen.getByRole("button", { name: "Post comment" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/projects/p1/comments",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ body: "New project note" }),
    }),
  );
  expect(screen.getByLabelText("Add a comment")).toHaveValue("");
  expect(screen.getByRole("status")).toHaveTextContent("Comment posted.");
});
it("keeps entered text after connection failure and rejects whitespace locally", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  render(
    <ProjectDiscussion
      projectId="p1"
      userId="member"
      canModerate={false}
      calendarLabel="Central Time"
      data={data}
    />,
  );
  await user.type(screen.getByLabelText("Add a comment"), "Draft to keep");
  await user.click(screen.getByRole("button", { name: "Post comment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your text has been kept",
  );
  expect(screen.getByLabelText("Add a comment")).toHaveValue("Draft to keep");
  expect(refresh).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Add a comment"));
  await user.type(screen.getByLabelText("Add a comment"), "   ");
  await user.click(screen.getByRole("button", { name: "Post comment" }));
  expect(fetcher).toHaveBeenCalledOnce();
});
it("keeps an edit draft and its original version when a newer version arrives", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Comment changed." }),
    });
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <ProjectDiscussion
      projectId="p1"
      userId="member"
      canModerate={false}
      calendarLabel="Central Time"
      data={data}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Edit" }));
  await user.clear(screen.getByLabelText("Edit comment"));
  await user.type(screen.getByLabelText("Edit comment"), "My edit draft");
  rerender(
    <ProjectDiscussion
      projectId="p1"
      userId="member"
      canModerate={false}
      calendarLabel="Central Time"
      data={{
        ...data,
        items: [{ ...comment, body: "A newer edit", version: 1 }],
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Comment changed.",
  );
  expect(screen.getByLabelText("Edit comment")).toHaveValue("My edit draft");
  expect(fetcher).toHaveBeenCalledWith(
    "/api/projects/p1/comments/c1",
    expect.objectContaining({
      body: JSON.stringify({ body: "My edit draft", version: 0 }),
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Discard edit and refresh" }),
  );
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByText("A newer edit")).toBeVisible();
});
it("requires deletion confirmation and sends the reviewed version", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <ProjectDiscussion
      projectId="p1"
      userId="member"
      canModerate={false}
      calendarLabel="Central Time"
      data={data}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel delete" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete" }));
  rerender(
    <ProjectDiscussion
      projectId="p1"
      userId="member"
      canModerate={false}
      calendarLabel="Central Time"
      data={{
        ...data,
        items: [{ ...comment, version: 1, body: "Changed while confirming" }],
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/projects/p1/comments/c1",
    expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ version: 0 }),
    }),
  );
});
it("shows page links and returns to the newest page after posting", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
  render(
    <ProjectDiscussion
      projectId="p1"
      userId="member"
      canModerate={false}
      calendarLabel="Central Time"
      requestedPage={2}
      data={{ ...data, page: 2, pageCount: 3, total: 51 }}
    />,
  );
  expect(screen.getByRole("link", { name: "Newer comments" })).toHaveAttribute(
    "href",
    "/projects/p1?commentsPage=1#project-discussion",
  );
  expect(screen.getByRole("link", { name: "Older comments" })).toHaveAttribute(
    "href",
    "/projects/p1?commentsPage=3#project-discussion",
  );
  await user.type(screen.getByLabelText("Add a comment"), "Newest note");
  await user.click(screen.getByRole("button", { name: "Post comment" }));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith(
      "/projects/p1?commentsPage=1#project-discussion",
    ),
  );
});
