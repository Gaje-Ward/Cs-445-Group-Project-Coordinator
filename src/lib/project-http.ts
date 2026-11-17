import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { ZodError } from "zod";
import { ProjectNotFoundError } from "./project-service";

export const projectReply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function projectRequest(
  action: (userId: string) => Promise<Response>,
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return projectReply({ error: "Please log in." }, 401);
    return await action(session.user.id);
  } catch (error) {
    if (error instanceof RequestError)
      return projectReply({ error: error.message }, error.status);
    if (error instanceof ProjectNotFoundError)
      return projectReply({ error: "Project not found." }, 404);
    if (error instanceof ZodError)
      return projectReply(
        {
          error: "Please check your input.",
          fields: error.flatten().fieldErrors,
        },
        400,
      );
    return projectReply(
      { error: "Projects are temporarily unavailable. Please try again." },
      503,
    );
  }
}
export async function projectInput(request: Request): Promise<unknown> {
  const origin =
    process.env.NEXTAUTH_URL && new URL(process.env.NEXTAUTH_URL).origin;
  if (!origin || request.headers.get("origin") !== origin)
    throw new RequestError("Request origin is not allowed.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RequestError("Send JSON input.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Invalid request body.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader.cancel();
        throw new RequestError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new RequestError("Invalid JSON input.", 400);
    }
  } finally {
    reader.releaseLock();
  }
}
