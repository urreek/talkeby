export function shouldCacheApi(url: URL): boolean {
  return url.pathname.startsWith("/api/")
    && !/^\/api\/jobs\/[^/]+\/(?:images(?:\/|$)|output-image(?:\/|$)|output-media(?:\/|$))/.test(url.pathname);
}
