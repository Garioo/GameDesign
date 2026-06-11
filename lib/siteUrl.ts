const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

export function getAppOrigin(): string {
  return configuredSiteUrl ?? window.location.origin;
}

export function appUrl(path: string): string {
  return `${getAppOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}
