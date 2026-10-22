export const MEDIA_FAILURE_MESSAGES: Readonly<Record<string, string>>;
export function diagnoseMediaFailure(
  url: string,
  kind: "image" | "video",
  options?: { signal?: AbortSignal; fetcher?: typeof fetch },
): Promise<string>;
