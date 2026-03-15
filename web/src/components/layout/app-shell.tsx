import { Link, useRouterState } from "@tanstack/react-router";
import { Cog, Home } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, PropsWithChildren } from "react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/cn";

const navItems = [
  { to: "/", label: "Jobs", icon: Home },
  { to: "/settings", label: "Settings", icon: Cog },
] as const;

export function AppShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const isWorkspaceRoute = pathname === "/";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const isKeyboardTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      if (target instanceof HTMLTextAreaElement) {
        return true;
      }

      if (target instanceof HTMLInputElement) {
        const nonTextTypes = new Set([
          "button",
          "checkbox",
          "color",
          "file",
          "hidden",
          "image",
          "radio",
          "range",
          "reset",
          "submit",
        ]);

        return !nonTextTypes.has(target.type);
      }

      return false;
    };

    const hasFocusedKeyboardTarget = () => isKeyboardTarget(document.activeElement);

    const updateKeyboardInset = () => {
      if (!hasFocusedKeyboardTarget()) {
        setKeyboardInset(0);
        return;
      }

      const overlap = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );

      setKeyboardInset(overlap > 80 ? overlap : 0);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (isKeyboardTarget(event.target)) {
        updateKeyboardInset();
      }
    };

    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        if (!hasFocusedKeyboardTarget()) {
          setKeyboardInset(0);
        }
      });
    };

    updateKeyboardInset();
    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);
    window.addEventListener("resize", updateKeyboardInset);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
      window.removeEventListener("resize", updateKeyboardInset);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const shellStyle = {
    "--talkeby-keyboard-inset": `${keyboardInset}px`,
    "--talkeby-bottom-clearance":
      "calc(env(safe-area-inset-bottom, 0px) + var(--talkeby-keyboard-inset) + 0.75rem)",
  } as CSSProperties;

  return (
    <div
      className="talkeby-app relative mx-auto flex h-dvh h-screen w-full max-w-xl flex-col overflow-hidden bg-slate-950"
      style={shellStyle}
    >
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-60 dark:opacity-40 transition-opacity duration-1000"
          src="https://4kwallpapers.com/images/walls/thumbs_3t/9621.jpg"
        />
        {/* Glass Overlay - universally dark to blend into space */}
        <div className="absolute inset-0 bg-slate-950/60 dark:bg-background/40 backdrop-blur-[12px]"></div>
      </div>

      <header className="theme-header sticky top-0 z-20 shrink-0 border-b border-foreground/5 px-4 py-3 backdrop-blur-xl transition-all duration-300 dark:border-white/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-lg font-bold tracking-tight text-transparent drop-shadow-md">
              Talkeby Mobile
            </h1>
          </div>
          <ThemeToggle />
        </div>

        <nav className="mt-3">
          <div className="theme-surface inline-grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-card/80 p-1 shadow-lg backdrop-blur-xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col px-4 pb-[calc(var(--talkeby-bottom-clearance)+1rem)] pt-4",
          isWorkspaceRoute ? "overflow-hidden" : "overflow-y-auto",
        )}
      >
        {children}
      </main>
    </div>
  );
}
