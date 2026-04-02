import { Link, useRouterState } from "@tanstack/react-router";
import { House, PanelLeft, SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties, PropsWithChildren } from "react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const isWorkspaceRoute = pathname === "/";
  const isTerminalRoute = pathname === "/terminal";

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
  "--talkeby-top-clearance": "env(safe-area-inset-top, 0px)",
  "--talkeby-keyboard-inset": `${keyboardInset}px`,
  "--talkeby-bottom-clearance":
    "calc(env(safe-area-inset-bottom, 0px) + var(--talkeby-keyboard-inset) + 0.75rem)",
} as CSSProperties;

  return (
    <div className="talkeby-app relative min-h-dvh bg-background" style={shellStyle}>
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25 transition-opacity duration-1000 dark:opacity-40"
          src="https://4kwallpapers.com/images/walls/thumbs_3t/9621.jpg"
        />
        <div className="absolute inset-0 bg-background/75 backdrop-blur-[14px] dark:bg-background/55" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,116,144,0.10),transparent_32%)] dark:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.10),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_30%)]" />
      </div>

      <div className="relative mx-auto flex h-dvh h-screen w-full max-w-[1600px] flex-col overflow-hidden pt-[var(--talkeby-top-clearance)] lg:p-4 lg:pt-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-xl lg:border lg:border-border/40 lg:bg-card/60 lg:shadow-[0_24px_80px_rgba(15,23,42,0.2)] lg:backdrop-blur-2xl dark:lg:border-white/10 dark:lg:bg-slate-950/55 dark:lg:shadow-[0_24px_80px_rgba(15,23,42,0.45)]">
          <header className="theme-header sticky top-0 z-20 shrink-0 border-b border-foreground/5 px-3 py-2.5 backdrop-blur-xl transition-all duration-300 sm:px-4 lg:px-5 lg:py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex items-baseline gap-2 sm:gap-3">
                <Link
                  to="/"
                  className="truncate bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-lg font-bold tracking-tight text-transparent drop-shadow-md transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:text-xl"
                >
                  Talkeby
                </Link>
                <p className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Local-first coding cockpit
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <div className="flex items-center gap-2">
                  {isWorkspaceRoute ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="-ml-3 h-10 rounded-l-none rounded-r-xl border-l-0 border-border/50 bg-card/85 px-3 pr-4 text-xs font-semibold shadow-lg backdrop-blur-xl sm:hidden"
                      onClick={() => window.dispatchEvent(new CustomEvent("talkeby:open-workspace-drawer"))}
                    >
                      <PanelLeft className="size-4" />
                      Workspace
                    </Button>
                  ) : null}
                  {isTerminalRoute ? (
                    <Button asChild type="button" variant="outline" size="icon" className="rounded-xl">
                      <Link to="/" aria-label="Back to chat">
                        <House className="size-4" />
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild type="button" variant={isTerminalRoute ? "default" : "outline"} size="icon" className="rounded-xl">
                    <Link to="/terminal" aria-label="Open terminal">
                      <SquareTerminal className="size-4" />
                    </Link>
                  </Button>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col px-3 pb-0 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5",
              isWorkspaceRoute ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}





