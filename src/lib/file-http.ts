import "server-only";
import { FileError, fileType, validateFileSize } from "./file-validation";
export function fileInput(request: Request) {
  const origin =
    process.env.NEXTAUTH_URL && new URL(process.env.NEXTAUTH_URL).origin;
  if (!origin || request.headers.get("origin") !== origin)
    throw new FileError("Request origin is not allowed.", 403);
  if (
    request.headers.get("content-type")?.split(";", 1)[0].trim() !==
    "application/octet-stream"
  )
    throw new FileError("Send the file as binary data.", 415);
  let name: string;
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "");
  } catch {
    throw new FileError("Invalid filename.");
  }
  fileType(name);
  const declared = request.headers.get("x-file-size");
  if (!declared || !/^\d+$/.test(declared))
    throw new FileError("Send the file size with the upload.");
  const size = Number(declared);
  validateFileSize(size);
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) !== size)
    throw new FileError("The upload size changed. Select the file again.");
  if (!request.body) throw new FileError("Choose a file that is not empty.");
  return { name, size, body: request.body };
}
export function fileDownload(file: {
  name: string;
  size: number;
  body: ReadableStream<Uint8Array> | Uint8Array;
}) {
  const encoded = encodeURIComponent(file.name).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return new Response(
    file.body instanceof Uint8Array ? new Uint8Array(file.body) : file.body,
    {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    },
  );
}
