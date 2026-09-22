import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { isMoodleCalendarUrl } from "@/lib/ical";

/**
 * Proxies a workspace's subscribed Moodle calendar. Moodle sends no CORS headers, so the
 * browser can't read the .ics itself. The caller's Supabase session decides access: the
 * link is read with their token through calendar_feed_url(), which checks membership.
 */
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

function fail(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Loopback, private, link-local, CGNAT and other non-public ranges. */
function isPrivateAddress(address: string) {
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = address.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

export async function GET(request: Request) {
  const feedId = new URL(request.url).searchParams.get("id") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(feedId)) return fail(400, "Unknown calendar.");
  if (!auth.startsWith("Bearer ")) return fail(401, "Sign in to load this calendar.");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: link, error } = await supabase.rpc("calendar_feed_url", { p_feed: feedId });
  if (error) return fail(error.code === "PGRST202" ? 503 : 401,
    error.code === "PGRST202" ? "Subscribed calendars need a database update. Apply the calendar-feeds migration in Supabase." : "Sign in to load this calendar.");
  if (typeof link !== "string" || !isMoodleCalendarUrl(link)) return fail(404, "This calendar was removed.");

  const url = new URL(link);
  try {
    if (url.hostname === "localhost" || isIP(url.hostname.replace(/^\[|\]$/g, ""))) throw new Error();
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error();
  } catch {
    return fail(400, "That Moodle address can't be reached from here.");
  }

  let response: Response;
  try {
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { Accept: "text/calendar" } });
  } catch {
    return fail(504, "Moodle didn't respond. Try again later.");
  }
  if (!response.ok) return fail(502, `Moodle answered with ${response.status}. Check that the calendar link still works.`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) return fail(502, "The Moodle calendar is too large.");
  const text = await response.text();
  if (text.length > MAX_BYTES) return fail(502, "The Moodle calendar is too large.");
  if (!text.trimStart().startsWith("BEGIN:VCALENDAR"))
    return fail(502, "Moodle didn't return a calendar. The link may have been reset — add it again.");

  return new Response(text, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
