import { admin } from "@/lib/admin";
import { adminRequest } from "@/lib/admin-http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return adminRequest(async (userId) => {
    const input = Object.fromEntries(new URL(request.url).searchParams);
    const { query, counts } = await admin.overview(userId, input);
    const result = await admin[query.view](userId, query);
    return Response.json(
      { view: query.view, counts, ...result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
