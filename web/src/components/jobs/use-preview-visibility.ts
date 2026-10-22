import { useEffect, useRef, useState } from "react";

const listeners = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;

export function usePreviewVisibility() {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!window.IntersectionObserver) { setVisible(true); return; }
    observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
    }, { rootMargin: "160px" });
    listeners.set(node, setVisible);
    observer.observe(node);
    return () => {
      listeners.delete(node);
      observer?.unobserve(node);
      if (!listeners.size) { observer?.disconnect(); observer = null; }
    };
  }, []);

  return { ref, visible };
}
