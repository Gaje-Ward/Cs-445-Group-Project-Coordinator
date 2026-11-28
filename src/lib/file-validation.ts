export const MAX_FILE_BYTES = 512 * 1024 * 1024;
export const PROJECT_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const PROJECT_FILE_COUNT = 100;
export const FILE_ACCEPT = ".pdf,.txt,.png,.jpg,.jpeg,.zip,.docx";
export class FileError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function fileType(name: string) {
  if (
    !name ||
    name.length > 180 ||
    name !== name.trim() ||
    /[\x00-\x1f\x7f/\\<>:"|?*]/.test(name) ||
    name.endsWith(".") ||
    name === "." ||
    name === ".."
  )
    throw new FileError(
      "Use a filename of up to 180 characters without path or special characters.",
    );
  const types: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    zip: "application/zip",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
  };
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (!Object.hasOwn(types, extension))
    throw new FileError(
      "Choose a PDF, text, PNG, JPEG, ZIP, or DOCX file.",
      415,
    );
  return { extension, mediaType: types[extension] };
}
export function validateFileSize(size: number) {
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new FileError("Choose a file that is not empty.");
  if (size > MAX_FILE_BYTES)
    throw new FileError("Files must be 512 MB or smaller.", 413);
}
export function createFileValidator(name: string, expectedSize: number) {
  validateFileSize(expectedSize);
  const { extension, mediaType } = fileType(name);
  const prefix = new Uint8Array(8);
  let prefixLength = 0;
  let length = 0;
  const decoder =
    extension === "txt" ? new TextDecoder("utf-8", { fatal: true }) : null;
  const mismatch = () =>
    new FileError("The file content does not match its extension.", 415);
  function text(chunk: Uint8Array, stream: boolean) {
    try {
      if (
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(
          decoder!.decode(chunk, { stream }),
        )
      )
        throw mismatch();
    } catch {
      throw mismatch();
    }
  }
  return {
    push(chunk: Uint8Array) {
      length += chunk.length;
      if (length > MAX_FILE_BYTES)
        throw new FileError("Files must be 512 MB or smaller.", 413);
      if (length > expectedSize)
        throw new FileError("The upload size changed. Select the file again.");
      const take = Math.min(8 - prefixLength, chunk.length);
      prefix.set(chunk.subarray(0, take), prefixLength);
      prefixLength += take;
      if (decoder) text(chunk, true);
    },
    finish() {
      if (length !== expectedSize)
        throw new FileError("The upload was incomplete. Please try again.");
      if (decoder) {
        text(new Uint8Array(), false);
        return mediaType;
      }
      const starts = (...signature: number[]) =>
        signature.length <= prefixLength &&
        signature.every((b, i) => prefix[i] === b);
      if (
        (extension === "pdf" && starts(37, 80, 68, 70, 45)) ||
        (extension === "png" && starts(137, 80, 78, 71, 13, 10, 26, 10)) ||
        (["jpg", "jpeg"].includes(extension) && starts(255, 216, 255)) ||
        (["zip", "docx"].includes(extension) &&
          (starts(80, 75, 3, 4) || starts(80, 75, 5, 6)))
      )
        return mediaType;
      throw mismatch();
    },
  };
}
export function validateFile(name: string, bytes: Uint8Array) {
  const validator = createFileValidator(name, bytes.length);
  validator.push(bytes);
  return validator.finish();
}
