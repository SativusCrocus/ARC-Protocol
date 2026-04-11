function getBackendUrl(): string {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}/_/backend`;
  return "http://localhost:8000";
}

const BACKEND = getBackendUrl();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${BACKEND}/${path.join("/")}`;
  const search = new URL(request.url).searchParams.toString();
  const fullUrl = search ? `${url}?${search}` : url;

  try {
    const res = await fetch(fullUrl, { cache: "no-store" });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "Backend unavailable" }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const url = `${BACKEND}/${path.join("/")}`;
  const body = await request.text();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "Backend unavailable" }, { status: 502 });
  }
}
