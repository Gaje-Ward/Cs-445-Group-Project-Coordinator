import { registrationSchema } from "@/lib/validation";
import { users } from "@/lib/users";
import { DuplicateEmailError } from "@/lib/user-service";
import { allowRegistration } from "@/lib/rate-limit";
export const runtime = "nodejs";
const reply = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const expectedOrigin =
    process.env.NEXTAUTH_URL && new URL(process.env.NEXTAUTH_URL).origin;
  if (!expectedOrigin || request.headers.get("origin") !== expectedOrigin)
    return reply({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "Send JSON input." }, 415);
  if (!allowRegistration("register"))
    return reply(
      { error: "Too many registration attempts. Try again in a minute." },
      429,
    );
  // Enforce a real byte limit, including requests with missing/incorrect Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "Invalid request body." }, 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        return reply({ error: "Request body is too large." }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return reply({ error: "Invalid JSON input." }, 400);
    }
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success)
      return reply(
        {
          error: "Please check your input.",
          fields: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    const user = await users.register(parsed.data);
    return reply({ user }, 201);
  } catch (error) {
    if (error instanceof DuplicateEmailError)
      return reply({ error: error.message }, 409);
    return reply(
      { error: "Registration is temporarily unavailable. Please try again." },
      503,
    );
  } finally {
    reader.releaseLock();
  }
}
