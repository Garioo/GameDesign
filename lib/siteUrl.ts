const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function getAppOrigin(): string {
  const currentOrigin = window.location.origin;
  if (isLocalOrigin(currentOrigin)) return currentOrigin;
  return configuredSiteUrl ?? currentOrigin;
}

export function appUrl(path: string): string {
  return `${getAppOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
