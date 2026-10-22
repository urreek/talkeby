import { Expand, ImageIcon, Play } from "lucide-react";
import { useState } from "react";

import { useMediaPreview, type MediaPreview } from "./media-preview-context";
import { usePreviewVisibility } from "./use-preview-visibility";

export function MediaPreviewCard({ url, kind, label }: MediaPreview) {
  const open = useMediaPreview();
  const { ref, visible } = usePreviewVisibility();
  const [failed, setFailed] = useState(false);
  const animated = /\.gif$/i.test(url);

  return (
    <button ref={ref} type="button" aria-label={`Open ${label}`} onClick={() => open({ url, kind, label })}
      className="group my-2 inline-flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card text-left align-top shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-violet-500/15 via-muted to-indigo-500/15">
        {kind === "image" && !animated && visible && !failed
          ? <img src={url} alt={label} loading="lazy" decoding="async" onError={() => setFailed(true)}
              className="m-0 size-full object-cover" />
          : <span className="absolute inset-0 flex items-center justify-center text-primary/80">
              {kind === "video" ? <Play className="size-10 fill-current" /> : <ImageIcon className="size-9" />}
            </span>}
        <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-85 transition-transform group-hover:scale-105">
          {kind === "video" ? <Play className="size-4 fill-current" /> : <Expand className="size-4" />}
        </span>
      </span>
      <span className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2.5 text-[11px]">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 text-muted-foreground">{failed ? "Unavailable" : kind === "video" ? "Watch video" : "View image"}</span>
      </span>
    </button>
  );
}
