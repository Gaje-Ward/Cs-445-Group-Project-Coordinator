// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { AdminUserControls } from "@/components/admin-user-controls";
const account = {
  id: "target",
  name: "Casey",
  email: "casey@example.com",
  isAdmin: false,
  isActive: true,
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("requires confirmation for access changes and supports cancelling", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  render(<AdminUserControls user={account} currentUserId="admin" />);
  await user.click(screen.getByText(/Manage user/));
  await user.click(screen.getByRole("button", { name: "Grant admin access" }));
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByText(/download any project's files/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Disable account" }));
  await user.click(screen.getByRole("button", { name: "Confirm change" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/users/target",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    }),
  );
});
it("allows name edits while hiding self-lockout controls", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  render(
    <AdminUserControls
      user={{ ...account, id: "admin", isAdmin: true }}
      currentUserId="admin"
    />,
  );
  await user.click(screen.getByText(/Manage user/));
  expect(
    screen.queryByRole("button", { name: "Disable account" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Remove admin access" }),
  ).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Display name"));
  await user.type(screen.getByLabelText("Display name"), "Casey Ward");
  await user.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/users/admin",
    expect.objectContaining({ body: JSON.stringify({ name: "Casey Ward" }) }),
  );
});
it("keeps edited text and reports an unsuccessful change", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Administrator access is required." }),
    }),
  );
  render(<AdminUserControls user={account} currentUserId="admin" />);
  await user.click(screen.getByText(/Manage user/));
  await user.clear(screen.getByLabelText("Display name"));
  await user.type(screen.getByLabelText("Display name"), "Changed name");
  await user.click(screen.getByRole("button", { name: "Save name" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Administrator access is required.",
  );
  expect(screen.getByLabelText("Display name")).toHaveValue("Changed name");
  expect(refresh).not.toHaveBeenCalled();
});
