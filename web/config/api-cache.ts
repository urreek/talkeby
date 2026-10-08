export function shouldCacheApi(url: URL): boolean {
  return url.pathname.startsWith("/api/")
    && !/^\/api\/jobs\/[^/]+\/(?:images(?:\/|$)|output-image(?:\/|$))/.test(url.pathname);
}
