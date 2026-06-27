const AUTH_ROUTES = ['/sign-in', '/auth/callback'];

/** Keep post-auth redirects inside this app and away from auth loops. */
export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return '/tracker';
  if (AUTH_ROUTES.some((route) => candidate === route || candidate.startsWith(`${route}?`))) {
    return '/tracker';
  }
  return candidate;
}
