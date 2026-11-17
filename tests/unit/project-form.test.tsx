// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ProjectForm } from "@/components/project-form";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("submits a new project without client identity and shows success", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ project: { id: "p1" } }),
  });
  vi.stubGlobal("fetch", fetcher);
  render(<ProjectForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Project name"), "Course project");
  await user.click(screen.getByRole("button", { name: "Create project" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Project created.",
  );
  expect(screen.getByRole("link", { name: "View project" })).toHaveAttribute(
    "href",
    "/projects/p1",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    name: "Course project",
    description: "",
    deadline: "",
  });
});
it("prefills edits and sends a PATCH", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ project: { id: "p1" } }),
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <ProjectForm
      project={{
        id: "p1",
        name: "Existing",
        description: "Notes",
        deadline: "2027-01-01",
      }}
    />,
  );
  expect(screen.getByLabelText("Deadline (optional)")).toHaveValue(
    "2027-01-01",
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Project updated.",
  );
  expect(fetcher.mock.calls[0][0]).toBe("/api/projects/p1");
  expect(fetcher.mock.calls[0][1].method).toBe("PATCH");
});
it("disables submission while saving and shows accessible server validation", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(<ProjectForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Project name"), "  ");
  await user.click(screen.getByRole("button", { name: "Create project" }));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  finish({
    ok: false,
    json: async () => ({
      error: "Please check your input.",
      fields: { name: ["Use at least 2 characters."] },
    }),
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Please check your input.",
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Project name")).toHaveAttribute(
      "aria-invalid",
      "true",
    ),
  );
  expect(screen.getByLabelText("Project name")).toHaveAccessibleDescription(
    "Use at least 2 characters.",
  );
});
it("keeps entered values after a connection failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<ProjectForm />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Project name"), "Keep my work");
  await user.click(screen.getByRole("button", { name: "Create project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not connect.",
  );
  expect(screen.getByLabelText("Project name")).toHaveValue("Keep my work");
});
