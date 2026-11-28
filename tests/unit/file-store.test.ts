import { afterAll, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { FileStore } from "@/lib/file-store";
const root = await mkdtemp(join(tmpdir(), "gpc-store-test-"));
const store = new FileStore(root);
afterAll(() => rm(root, { recursive: true, force: true }));
it("streams a file larger than the old limit and reads identical bytes", async () => {
  const size = 12 * 1024 * 1024;
  const chunk = new Uint8Array(64 * 1024).fill(65);
  chunk.set([80, 75, 3, 4]);
  let remaining = size;
  const expected = createHash("sha256");
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (!remaining) {
        c.close();
        return;
      }
      const part = chunk.subarray(0, Math.min(remaining, chunk.length));
      remaining -= part.length;
      expected.update(part);
      c.enqueue(part);
    },
  });
  const key = randomUUID();
  await store.write(key, "large.zip", size, body);
  const reader = (await store.read(key, size)).getReader();
  const actual = createHash("sha256");
  let count = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    count += value.length;
    actual.update(value);
    expect(value.length).toBeLessThanOrEqual(64 * 1024);
  }
  expect(count).toBe(size);
  expect(actual.digest("hex")).toBe(expected.digest("hex"));
  await store.remove(key);
  await expect(store.read(key, size)).rejects.toThrow();
});
it("rejects storage paths supplied as keys", () => {
  for (const key of [
    "../secret",
    "C:\\secret",
    "/tmp/file",
    "..",
    randomUUID() + "/file",
  ])
    expect(() => store.path(key)).toThrow(/key/);
});
it("closes a cancelled download so its disk file can be removed", async () => {
  const key = randomUUID();
  const chunk = new Uint8Array(1024 * 1024).fill(65);
  await store.write(
    key,
    "notes.txt",
    chunk.length,
    new ReadableStream({
      start(c) {
        c.enqueue(chunk);
        c.close();
      },
    }),
  );
  const reader = (await store.read(key, chunk.length)).getReader();
  await reader.read();
  await reader.cancel();
  await store.remove(key);
  await expect(store.read(key, chunk.length)).rejects.toThrow();
});
