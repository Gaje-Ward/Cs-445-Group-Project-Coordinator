import { expect, it } from "vitest";
import {
  validateFile,
  MAX_FILE_BYTES,
  createFileValidator,
} from "@/lib/file-validation";
const text = new TextEncoder().encode("Project notes\nNext steps\tDraft");
it("accepts supported extensions only when the content signature matches", () => {
  for (const [name, bytes, type] of [
    ["notes.TXT", text, "text/plain"],
    ["report.pdf", [37, 80, 68, 70, 45], "application/pdf"],
    ["photo.png", [137, 80, 78, 71, 13, 10, 26, 10], "image/png"],
    ["photo.jpeg", [255, 216, 255], "image/jpeg"],
    ["project.zip", [80, 75, 3, 4], "application/zip"],
    [
      "report.docx",
      [80, 75, 3, 4],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ] as const)
    expect(validateFile(name, new Uint8Array(bytes))).toBe(type);
});
it("rejects paths, header injection, unsupported types, and misleading extensions", () => {
  for (const name of [
    "../notes.txt",
    "folder\\notes.txt",
    "a\r\n.txt",
    "bad:name.txt",
    " notes.txt",
    "notes.txt ",
    "notes.txt.",
    "x".repeat(181),
    "",
    "page.html",
    "image.svg",
    "program.exe",
    "script.txt.exe",
  ])
    expect(() => validateFile(name, text)).toThrow();
  expect(() => validateFile("fake.pdf", text)).toThrow(/content/);
  expect(() => validateFile("binary.txt", new Uint8Array([0, 1, 2]))).toThrow();
  expect(() => validateFile("invalid.txt", new Uint8Array([255]))).toThrow();
});
it("enforces nonempty content and the exact file size boundary", () => {
  expect(() => validateFile("empty.txt", new Uint8Array())).toThrow(/empty/);
  expect(() => createFileValidator("large.zip", MAX_FILE_BYTES)).not.toThrow();
  expect(() => createFileValidator("large.zip", MAX_FILE_BYTES + 1)).toThrow(
    /512 MB/,
  );
});
it("validates signatures and UTF-8 across chunk boundaries", () => {
  const zip = createFileValidator("archive.zip", 4);
  zip.push(new Uint8Array([80]));
  zip.push(new Uint8Array([75, 3, 4]));
  expect(zip.finish()).toBe("application/zip");
  const utf = createFileValidator("notes.txt", 2);
  utf.push(new Uint8Array([195]));
  utf.push(new Uint8Array([169]));
  expect(utf.finish()).toBe("text/plain");
  const incomplete = createFileValidator("bad.txt", 1);
  incomplete.push(new Uint8Array([195]));
  expect(() => incomplete.finish()).toThrow(/content/);
  const short = createFileValidator("short.zip", 10);
  short.push(new Uint8Array([80, 75, 3, 4]));
  expect(() => short.finish()).toThrow(/incomplete/);
  const long = createFileValidator("long.zip", 4);
  expect(() => long.push(new Uint8Array(5))).toThrow(/size changed/);
});
it("accepts the full streamed limit and rejects a byte beyond it without a large allocation", () => {
  const validator = createFileValidator("limit.zip", MAX_FILE_BYTES);
  const chunk = new Uint8Array(64 * 1024);
  chunk.set([80, 75, 3, 4]);
  for (let size = 0; size < MAX_FILE_BYTES; size += chunk.length)
    validator.push(chunk);
  expect(validator.finish()).toBe("application/zip");
  expect(() => validator.push(new Uint8Array(1))).toThrow(/512 MB/);
});
