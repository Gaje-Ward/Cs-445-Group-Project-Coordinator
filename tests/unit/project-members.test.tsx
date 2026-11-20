// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { ProjectMembers } from "@/components/project-members";

const team = [
  { userId: "owner", name: "Alex", role: "OWNER" as const },
  { userId: "member", name: "Jordan", role: "MEMBER" as const },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows the roster to members without membership controls", () => {
  render(<ProjectMembers projectId="p1" members={team} canManage={false} />);
  expect(screen.getByText("Alex")).toBeVisible();
  expect(screen.getByText("Jordan")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Teammate email")).not.toBeInTheDocument();
});

it("adds by email without sending a client role or actor identity", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ member: team[1] }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ProjectMembers projectId="p1" members={team} canManage />);
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Teammate email"),
    "jordan@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Add teammate" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Teammate added.",
  );
  expect(fetcher).toHaveBeenCalledWith("/api/projects/p1/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "jordan@example.com" }),
  });
  expect(screen.getByLabelText("Teammate email")).toHaveValue("");
  expect(refresh).toHaveBeenCalledOnce();
});

it("requires confirmation for removal, supports cancel, and never offers owner removal", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ removed: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ProjectMembers projectId="p1" members={team} canManage />);
  const user = userEvent.setup();
  expect(
    screen.queryByRole("button", { name: "Remove Alex" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove Jordan" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(
    screen.queryByRole("button", { name: "Confirm removal" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove Jordan" }));
  await user.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Teammate removed.",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    userId: "member",
  });
  expect(fetcher.mock.calls[0][1].method).toBe("DELETE");
  expect(refresh).toHaveBeenCalledOnce();
});

it("disables controls while adding and presents accessible email validation", async () => {
  let finish!: (response: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(<ProjectMembers projectId="p1" members={team} canManage />);
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Teammate email"),
    "jordan@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Add teammate" }));
  expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove Jordan" })).toBeDisabled();
  finish({
    ok: false,
    json: async () => ({
      error: "Please check your input.",
      fields: { email: ["Enter a valid email address."] },
    }),
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Please check your input.",
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Teammate email")).toHaveAttribute(
      "aria-invalid",
      "true",
    ),
  );
  expect(screen.getByLabelText("Teammate email")).toHaveAccessibleDescription(
    /Enter a valid email address/,
  );
  expect(refresh).not.toHaveBeenCalled();
});

it("preserves the email after a connection failure and allows retry", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ member: team[1] }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<ProjectMembers projectId="p1" members={team} canManage />);
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText("Teammate email"),
    "jordan@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Add teammate" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not connect.",
  );
  expect(screen.getByLabelText("Teammate email")).toHaveValue(
    "jordan@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Add teammate" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Teammate added.",
  );
});

it("keeps failed removal available for retry and shows server conflict feedback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "That person is no longer on this project.",
      }),
    }),
  );
  render(<ProjectMembers projectId="p1" members={team} canManage />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Remove Jordan" }));
  await user.click(screen.getByRole("button", { name: "Confirm removal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer on this project",
  );
  expect(screen.getByRole("button", { name: "Confirm removal" })).toBeEnabled();
  expect(refresh).not.toHaveBeenCalled();
});
