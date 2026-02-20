import { Link, useRouterState } from "@tanstack/react-router";
import { Cog, Home } from "lucide-react";
import type { PropsWithChildren } from "react";

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

  return (
    <div className="talkeby-app mx-auto flex min-h-screen w-full max-w-xl flex-col bg-slate-950 pb-28 relative">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-60 dark:opacity-40 transition-opacity duration-1000"
          src="https://4kwallpapers.com/images/walls/thumbs_3t/9621.jpg"
        />
        {/* Glass Overlay - universally dark to blend into space */}
        <div className="absolute inset-0 bg-slate-950/60 dark:bg-background/40 backdrop-blur-[12px]"></div>
      </div>

      <header className="theme-header sticky top-0 z-20 border-b border-foreground/5 dark:border-white/5 px-4 py-4 backdrop-blur-xl transition-all duration-300">
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

      <main className="flex-1 px-4 py-6 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-6 z-20 mx-auto max-w-sm px-4 animate-in slide-in-from-bottom-12 fade-in duration-700 delay-150 fill-mode-both">
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
