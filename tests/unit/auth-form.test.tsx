// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import { signIn } from "next-auth/react";
import { AuthForm } from "@/components/auth-form";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fill(register = false) {
  const user = userEvent.setup();
  if (register) await user.type(screen.getByLabelText("Name"), "Test Student");
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.type(
    screen.getByLabelText("Password"),
    "a long unique passphrase",
  );
  return user;
}
it("shows duplicate registration feedback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "An account with this email already exists.",
      }),
    }),
  );
  render(<AuthForm mode="register" />);
  const user = await fill(true);
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
});
it("shows registration success with a login link", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "123" } }),
    }),
  );
  render(<AuthForm mode="register" />);
  const user = await fill(true);
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Your account is ready",
  );
  expect(
    screen.getByRole("link", { name: "Continue to login" }),
  ).toHaveAttribute("href", "/login");
});
it("shows a generic invalid-login message", async () => {
  vi.mocked(signIn).mockResolvedValue({
    ok: false,
    error: "CredentialsSignin",
    status: 401,
    url: null,
  });
  render(<AuthForm mode="login" />);
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Log in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to log in",
  );
});
