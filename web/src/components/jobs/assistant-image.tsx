import { assistantMediaUrl, mediaKind } from "../../../../shared/assistant-media.mjs";
import { MediaPreviewCard } from "./media-preview-card";

export function AssistantImage({ jobId, source, alt }: { jobId: string; source?: string; alt?: string }) {
  const url = assistantMediaUrl(jobId, source);
  const kind = mediaKind(source);
  const label = alt || (kind === "video" ? "Video preview" : "Screenshot");
  return url && kind ? <MediaPreviewCard url={url} kind={kind} label={label} />
    : <span className="text-sm text-muted-foreground">{label} (preview unavailable)</span>;
}
