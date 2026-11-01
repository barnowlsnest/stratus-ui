import { NextResponse, type NextRequest } from "next/server";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Hostnames the console answers to: loopback, plus any listed in STRATUS_UI_ALLOWED_HOSTS (comma separated). */
function allowedHosts(): string[] {
  const extra = process.env.STRATUS_UI_ALLOWED_HOSTS ?? "";
  return [...LOCAL_HOSTS, ...extra.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)];
}

/** The lowercase hostname of a Host header; null if it is anything but host or host:port. */
function hostname(host: string | null): string | null {
  if (!host || !/^[a-z0-9.-]+(:\d+)?$|^\[[0-9a-f:.]+\](:\d+)?$/i.test(host)) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

function originMatches(origin: string, host: string | null): boolean {
  try {
    return new URL(origin).host === host?.toLowerCase();
  } catch {
    return false;
  }
}

const refuse = (error: string) => NextResponse.json({ error, code: "FORBIDDEN" }, { status: 403 });

/**
 * The console has no login and acts with the tokens it stores, so being bound
 * to loopback is not enough: any website open in the browser can still send
 * requests to localhost. Only the console's own pages may call its API.
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host");
  // A foreign Host is DNS rebinding: an attacker's domain resolving to this machine, which also defeats same-origin checks.
  const name = hostname(host);
  if (!name || !allowedHosts().includes(name)) return refuse("This host is not allowed. Add it to STRATUS_UI_ALLOWED_HOSTS.");

  // Browsers set Sec-Fetch-Site on trustworthy origins; elsewhere Origin is what they send. Tools like curl send neither.
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  // "none" means the user opened the URL themselves, which can only ever be a read.
  const userOpened = site === "none" && (req.method === "GET" || req.method === "HEAD");
  if (site ? site !== "same-origin" && !userOpened : origin !== null && !originMatches(origin, host)) {
    return refuse("Cross-site requests are not allowed.");
  }

  // JSON is not a type a page can send without a CORS preflight, and no preflight is ever answered here.
  if (req.method === "POST" && !req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json", code: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
