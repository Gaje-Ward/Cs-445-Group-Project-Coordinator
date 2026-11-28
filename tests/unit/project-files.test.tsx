// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { ProjectFiles, type FileView } from "@/components/project-files";
const item: FileView = {
  id: "f1",
  name: "report.pdf",
  size: 512,
  uploaderId: "other",
  uploaderName: "Casey",
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("offers member downloads while hiding deletion for other people's uploads", () => {
  render(
    <ProjectFiles projectId="p1" items={[item]} userId="me" isOwner={false} />,
  );
  expect(screen.getByRole("link", { name: "report.pdf" })).toHaveAttribute(
    "href",
    "/api/projects/p1/files/f1",
  );
  expect(
    screen.queryByRole("button", { name: /Delete/ }),
  ).not.toBeInTheDocument();
});
it("uploads the selected file and refreshes after success", async () => {
  const user = userEvent.setup();
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  render(<ProjectFiles projectId="p1" items={[]} userId="me" isOwner />);
  const input = screen.getByLabelText("Choose file") as HTMLInputElement;
  const file = new File(["project notes"], "notes.txt", { type: "text/plain" });
  await user.upload(input, file);
  await user.click(screen.getByRole("button", { name: "Upload file" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/projects/p1/files",
    expect.objectContaining({ method: "POST", body: file }),
  );
  expect(input.files).toHaveLength(0);
  expect(screen.getByRole("status")).toHaveTextContent("File uploaded.");
});
it("preserves the selected file after failure and reports server rejection", async () => {
  const user = userEvent.setup();
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Project limit reached." }),
    });
  vi.stubGlobal("fetch", fetcher);
  render(<ProjectFiles projectId="p1" items={[]} userId="me" isOwner />);
  const input = screen.getByLabelText("Choose file") as HTMLInputElement;
  await user.upload(input, new File(["notes"], "notes.txt"));
  await user.click(screen.getByRole("button", { name: "Upload file" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not connect",
  );
  expect(input.files).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Upload file" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Project limit reached.",
  );
  expect(refresh).not.toHaveBeenCalled();
});
it("requires confirmation before deletion and permits cancellation", async () => {
  const user = userEvent.setup();
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetcher);
  render(<ProjectFiles projectId="p1" items={[item]} userId="me" isOwner />);
  await user.click(screen.getByRole("button", { name: "Delete report.pdf" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Delete report.pdf" }));
  await user.click(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    "/api/projects/p1/files/f1",
    expect.objectContaining({ method: "DELETE" }),
  );
});
it("allows cancelling an upload while retaining the selected file", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Cancelled", "AbortError")),
          ),
        ),
    ),
  );
  render(<ProjectFiles projectId="p1" items={[]} userId="me" isOwner />);
  const input = screen.getByLabelText("Choose file") as HTMLInputElement;
  await user.upload(input, new File(["notes"], "notes.txt"));
  await user.click(screen.getByRole("button", { name: "Upload file" }));
  await user.click(screen.getByRole("button", { name: "Cancel upload" }));
  expect(await screen.findByText("Upload cancelled.")).toBeVisible();
  expect(input.files).toHaveLength(1);
  expect(refresh).not.toHaveBeenCalled();
});
