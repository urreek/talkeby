import { createContext, lazy, Suspense, useCallback, useContext, useState, type ReactNode } from "react";

export type MediaPreview = { url: string; label: string; kind: "image" | "video" };

const MediaViewer = lazy(() => import("./media-viewer"));
const PreviewContext = createContext<((media: MediaPreview) => void) | null>(null);

export function MediaPreviewProvider({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState<MediaPreview | null>(null);
  const open = useCallback((next: MediaPreview) => setMedia(next), []);
  const close = useCallback(() => setMedia(null), []);

  return (
    <PreviewContext.Provider value={open}>
      {children}
      {media && <Suspense fallback={<span role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-popover px-4 py-2 text-sm shadow-lg">Opening preview…</span>}>
        <MediaViewer media={media} onClose={close} />
      </Suspense>}
    </PreviewContext.Provider>
  );
}

export function useMediaPreview() {
  const open = useContext(PreviewContext);
  if (!open) throw new Error("Media previews require MediaPreviewProvider.");
  return open;
}
