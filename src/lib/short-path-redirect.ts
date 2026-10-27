/** Short aliases → canonical paths. Targets match the live site (no trailing slash). */
const SHORT_PATHS: Record<string, string> = {
  '/privacy': '/privacy-policy',
  '/zh/privacy': '/zh/privacy-policy',
  '/terms': '/terms-of-service',
  '/zh/terms': '/zh/terms-of-service',
  '/about': '/',
  '/contact': '/',
  '/zh/about': '/zh',
  '/zh/contact': '/zh',
};

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function shortPathTarget(pathname: string): string | null {
  return SHORT_PATHS[normalizePathname(pathname)] ?? null;
}

export function shortPathRedirect(req: Request): Response | null {
  const url = new URL(req.url);
  const target = shortPathTarget(url.pathname);
  if (!target) return null;
  url.pathname = target;
  return Response.redirect(url.toString(), 301);
}
