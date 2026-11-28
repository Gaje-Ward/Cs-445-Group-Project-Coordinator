// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh, replace } = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));
import { AdminPasswordReset } from "@/components/admin-password-reset";
import { AdminDeleteUser } from "@/components/admin-delete-user";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("confirms a new password, clears it after success, and sends no secret in the UI response", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Password reset." }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<AdminPasswordReset userId="target" userName="Casey" self={false} />);
  await user.click(screen.getByText("Reset password", { selector: "summary" }));
  await user.type(
    screen.getByLabelText("New password"),
    "a new testing passphrase",
  );
  await user.type(
    screen.getByLabelText("Confirm new password"),
    "a new testing passphrase",
  );
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/users/target/password",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ password: "a new testing passphrase" }),
    }),
  );
  expect(screen.getByLabelText("New password")).toHaveValue("");
  expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  expect(screen.getByRole("status")).not.toHaveTextContent(
    "a new testing passphrase",
  );
});
it("rejects mismatched new passwords before sending a request", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<AdminPasswordReset userId="target" userName="Casey" self={false} />);
  await user.click(screen.getByText("Reset password", { selector: "summary" }));
  await user.type(
    screen.getByLabelText("New password"),
    "a new testing passphrase",
  );
  await user.type(
    screen.getByLabelText("Confirm new password"),
    "another testing passphrase",
  );
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Reset password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires the account email before permanent deletion and retains useful errors", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Transfer owned projects first." }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<AdminDeleteUser userId="target" email="casey@example.com" />);
  await user.click(
    screen.getByText("Permanently delete account", { selector: "summary" }),
  );
  const input = screen.getByLabelText("Type casey@example.com to confirm");
  await user.type(input, "wrong@example.com");
  await user.click(screen.getByRole("checkbox"));
  await user.click(
    screen.getByRole("button", { name: "Delete account permanently" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  await user.clear(input);
  await user.type(input, "casey@example.com");
  await user.click(
    screen.getByRole("button", { name: "Delete account permanently" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Transfer owned projects first.",
  );
  expect(input).toHaveValue("casey@example.com");
  expect(refresh).not.toHaveBeenCalled();
});
it("requires an explicit owned-project transfer before submitting owner deletion", async () => {
  const user = userEvent.setup(),
    fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Account deleted." }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(
    <AdminDeleteUser
      userId="target"
      email="casey@example.com"
      ownedProjectCount={2}
    />,
  );
  await user.click(
    screen.getByText("Permanently delete account", { selector: "summary" }),
  );
  await user.type(
    screen.getByLabelText("Type casey@example.com to confirm"),
    "casey@example.com",
  );
  await user.click(
    screen.getByRole("checkbox", {
      name: "I understand this account cannot be restored.",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Delete account permanently" }),
  );
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", {
      name: /Transfer this account's 2 owned projects/,
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Delete account permanently" }),
  );
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/admin/users/target",
    expect.objectContaining({
      body: JSON.stringify({
        confirmationEmail: "casey@example.com",
        transferOwnedProjects: true,
        expectedOwnedProjectCount: 2,
      }),
    }),
  );
});
