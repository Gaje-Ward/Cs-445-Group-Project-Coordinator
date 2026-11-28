// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh, push } = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
import { ProjectIdeas, type IdeaView } from "@/components/project-ideas";
const idea: IdeaView = {
  id: "i1",
  title: "Use a shared plan",
  body: "Discuss the design",
  authorId: "author",
  authorName: "Casey",
  createdAt: new Date(0).toISOString(),
  createdLabel: "Posted earlier",
  voteCount: 2,
  voted: false,
};
const props = {
  projectId: "p1",
  userId: "peer",
  isOwner: false,
  calendarLabel: "Central Time",
  data: { items: [idea], page: 1, pageCount: 1, total: 1 },
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("renders plain text and hides deletion from other members", () => {
  const { container } = render(
    <ProjectIdeas
      {...props}
      data={{
        ...props.data,
        items: [{ ...idea, body: "<img src=x onerror=alert(1)>" }],
      }}
    />,
  );
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("2 votes")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Vote" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(
    screen.queryByRole("button", { name: "Delete idea" }),
  ).not.toBeInTheDocument();
});
it("submits a proposal and clears text only after success", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ idea: { id: "new" } }),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ProjectIdeas {...props} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Idea title"), "  New approach  ");
  await user.type(
    screen.getByLabelText("Describe your idea"),
    " Try this first ",
  );
  await user.click(screen.getByRole("button", { name: "Post idea" }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    title: "New approach",
    body: "Try this first",
  });
  expect(screen.getByLabelText("Idea title")).toHaveValue("");
  expect(screen.getByLabelText("Describe your idea")).toHaveValue("");
});
it("keeps draft text after failure and rejects whitespace without a request", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  render(<ProjectIdeas {...props} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Idea title"), "Draft proposal");
  await user.type(
    screen.getByLabelText("Describe your idea"),
    "Keep this text",
  );
  await user.click(screen.getByRole("button", { name: "Post idea" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Describe your idea")).toHaveValue(
    "Keep this text",
  );
  await user.clear(screen.getByLabelText("Describe your idea"));
  await user.type(screen.getByLabelText("Describe your idea"), "  ");
  await user.click(screen.getByRole("button", { name: "Post idea" }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("sets an explicit vote state and removes only the caller's vote", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ voted: true, voteCount: 3 }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(<ProjectIdeas {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Vote" }));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/projects/p1/ideas/i1/vote",
    expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ voted: true }),
    }),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  rerender(
    <ProjectIdeas
      {...props}
      data={{ ...props.data, items: [{ ...idea, voted: true, voteCount: 3 }] }}
    />,
  );
  expect(screen.getByRole("button", { name: "Remove vote" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("button", { name: "Remove vote" }));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ voted: false });
});
it("requires confirmation before an owner removes another author's idea", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: "Idea deleted." }),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<ProjectIdeas {...props} isOwner />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Delete idea" }));
  expect(fetchMock).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel delete" }));
  expect(
    screen.queryByRole("button", { name: "Confirm delete" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Delete idea" }));
  await user.click(screen.getByRole("button", { name: "Confirm delete" }));
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/projects/p1/ideas/i1",
    expect.objectContaining({ method: "DELETE", body: "{}" }),
  );
});
it("preserves the discussion page while navigating or posting from older ideas", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ idea: { id: "new" } }),
    }),
  );
  render(
    <ProjectIdeas
      {...props}
      requestedPage={2}
      discussionPage={3}
      data={{ ...props.data, page: 2, pageCount: 3, total: 60 }}
    />,
  );
  expect(screen.getByRole("link", { name: "Newer ideas" })).toHaveAttribute(
    "href",
    "/projects/p1?ideasPage=1&commentsPage=3#project-ideas",
  );
  expect(screen.getByRole("link", { name: "Older ideas" })).toHaveAttribute(
    "href",
    "/projects/p1?ideasPage=3&commentsPage=3#project-ideas",
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Idea title"), "Latest proposal");
  await user.type(screen.getByLabelText("Describe your idea"), "Some details");
  await user.click(screen.getByRole("button", { name: "Post idea" }));
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith(
      "/projects/p1?ideasPage=1&commentsPage=3#project-ideas",
    ),
  );
});
