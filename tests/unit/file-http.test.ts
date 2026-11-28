import { afterEach, expect, it, vi } from "vitest";
import { fileInput, fileDownload } from "@/lib/file-http";
import { MAX_FILE_BYTES } from "@/lib/file-validation";
afterEach(() => vi.unstubAllEnvs());
function request(extra: Record<string, string> = {}) {
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  return new Request("http://localhost:3000/api/projects/p/files", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("résumé.txt"),
      "X-File-Size": "5",
      ...extra,
    },
    body: "notes",
  });
}
it("decodes metadata and leaves the upload body as a stream", async () => {
  const req = request();
  const file = fileInput(req);
  expect(file.name).toBe("résumé.txt");
  expect(file.size).toBe(5);
  expect(file.body).toBe(req.body);
  expect(req.bodyUsed).toBe(false);
});
it("rejects foreign origins, unexpected request types, and invalid filename encodings", () => {
  expect(() =>
    fileInput(request({ Origin: "https://elsewhere.test" })),
  ).toThrow(/origin/);
  expect(() =>
    fileInput(request({ "Content-Type": "multipart/form-data" })),
  ).toThrow(/binary/);
  expect(() => fileInput(request({ "X-File-Name": "%ZZ" }))).toThrow(
    /filename/,
  );
});
it("requires bounded declared sizes and rejects inconsistent content lengths", () => {
  for (const size of ["", "-1", "no", "1.5"])
    expect(() => fileInput(request({ "X-File-Size": size }))).toThrow(/size/);
  expect(() =>
    fileInput(request({ "X-File-Size": String(MAX_FILE_BYTES + 1) })),
  ).toThrow(/512 MB/);
  expect(() => fileInput(request({ "Content-Length": "6" }))).toThrow(
    /size changed/,
  );
});
it("streams an uncached attachment with an encoded filename and exact bytes", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode("notes"));
      c.close();
    },
  });
  const response = fileDownload({ name: "résumé (final).txt", size: 5, body });
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(response.headers.get("content-disposition")).toContain(
    "filename*=UTF-8''r%C3%A9sum%C3%A9%20%28final%29.txt",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.text()).toBe("notes");
});
