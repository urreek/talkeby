import { useState } from "react";
import { assistantImageUrl } from "../../../../shared/assistant-images.mjs";

export function AssistantImage({ jobId, source, alt }: { jobId: string; source?: string; alt?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const url = assistantImageUrl(jobId, source);
  const label = alt || "Session image";
  if (!url || failedSource === url) {
    return <span className="text-sm text-muted-foreground">{label} (image unavailable)</span>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-block max-w-full">
      <img src={url} alt={label} loading="lazy" onError={() => setFailedSource(url)}
        className="my-2 max-h-96 max-w-full rounded-lg border border-border object-contain" />
    </a>
  );
}
