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
    "--talkeby-nav-gap": "1.5rem",
    "--talkeby-nav-height": "5.5rem",
    "--talkeby-nav-offset":
      "calc(env(safe-area-inset-bottom, 0px) + var(--talkeby-nav-gap) + var(--talkeby-keyboard-inset))",
    "--talkeby-bottom-clearance":
      "calc(var(--talkeby-nav-offset) + var(--talkeby-nav-height))",
  } as CSSProperties;

  const navStyle: CSSProperties = {
    bottom: "var(--talkeby-nav-offset)",
  };

  return (
    <div
      className="talkeby-app relative mx-auto flex min-h-dvh min-h-screen w-full max-w-xl flex-col bg-slate-950"
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

      <header className="theme-header sticky top-0 z-20 shrink-0 border-b border-foreground/5 px-4 py-4 backdrop-blur-xl transition-all duration-300 dark:border-white/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-lg font-bold tracking-tight text-transparent drop-shadow-md">
              Talkeby Mobile
            </h1>
            <p className="text-sm font-medium text-white/70">
              Run Codex on your home machine, from anywhere.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col px-4 pb-[calc(var(--talkeby-bottom-clearance)+1rem)] pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both",
          isWorkspaceRoute && "overflow-hidden",
        )}
      >
        {children}
      </main>

      <nav
        className="fixed inset-x-0 z-20 mx-auto max-w-sm px-4 animate-in slide-in-from-bottom-12 fade-in duration-700 delay-150 fill-mode-both transition-[bottom] duration-200"
        style={navStyle}
      >
        <div className="theme-surface grid grid-cols-2 gap-2 rounded-[2rem] border border-white/10 bg-card/80 p-2 shadow-2xl backdrop-blur-xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition-all duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-100"
                    : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground scale-95 hover:scale-100",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 transition-transform duration-300",
                    isActive && "scale-110",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
