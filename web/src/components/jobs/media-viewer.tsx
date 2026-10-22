import { Download, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import type { MediaPreview } from "./media-preview-context";
import { diagnoseMediaFailure } from "../../../../shared/media-preview-errors.mjs";

function releaseVideo(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export default function MediaViewer({ media, onClose }: { media: MediaPreview; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureMessage, setFailureMessage] = useState("Preview could not be loaded. Retry or download the file.");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!failed || closing) return;
    const controller = new AbortController();
    void diagnoseMediaFailure(media.url, media.kind, { signal: controller.signal }).then((message) => {
      if (!controller.signal.aborted) setFailureMessage(message);
    });
    return () => controller.abort();
  }, [failed, closing, media.url, media.kind]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const focused = document.activeElement;
    const video = videoRef.current;
    dialog?.showModal();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      releaseVideo(video);
      dialog?.close();
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);

  const close = useCallback(() => {
    if (closing) return;
    releaseVideo(videoRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 180);
  }, [closing, onClose]);

  return createPortal(
    <dialog ref={dialogRef} aria-label={media.label} data-closing={closing} className="media-viewer"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="media-viewer-panel pointer-events-none mx-auto flex h-full w-full max-w-6xl flex-col gap-3 p-3 sm:p-6">
        <header className="pointer-events-auto flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-white">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{media.label}</p>
          <Button asChild variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white">
            <a href={media.url} download aria-label="Download preview"><Download aria-hidden="true" /></a>
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Close preview" onClick={close}
            className="size-11 shrink-0 rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white"><X aria-hidden="true" /></Button>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {failed ? <div className="pointer-events-auto rounded-2xl bg-zinc-900 p-5 text-center text-sm text-zinc-300">
              <p role="alert">{failureMessage}</p>
              <Button type="button" variant="secondary" className="mt-3" onClick={() => { setAttempt((value) => value + 1); setFailed(false); }}>Retry preview</Button>
            </div>
            : media.kind === "video"
              ? <video key={attempt} ref={videoRef} src={media.url} controls playsInline autoPlay muted preload="none" onError={() => { if (!closing) setFailed(true); }}
                  className="pointer-events-auto max-h-full max-w-full rounded-2xl bg-black shadow-2xl" />
              : <img key={attempt} src={media.url} alt={media.label} decoding="async" onError={() => { if (!closing) setFailed(true); }}
                  className="pointer-events-auto max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />}
        </div>
      </div>
    </dialog>, document.body,
  );
}
