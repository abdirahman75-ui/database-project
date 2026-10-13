import { handleApi } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function route(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return handleApi(request, path);
}
export { route as GET, route as POST, route as PATCH, route as DELETE };
