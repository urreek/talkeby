import { Link, useRouterState } from "@tanstack/react-router";
import { Cog, Home } from "lucide-react";
import type { PropsWithChildren } from "react";

import { cn } from "@/lib/cn";

const navItems = [
  { to: "/", label: "Jobs", icon: Home },
  { to: "/settings", label: "Settings", icon: Cog }
] as const;

export function AppShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col pb-24">
      <header className="px-4 pt-6">
        <div className="rounded-2xl border border-white/50 bg-white/70 p-4 shadow-soft backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight">Talkeby Mobile</h1>
          <p className="text-sm text-muted-foreground">Run Codex on your home machine, from anywhere.</p>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto max-w-xl p-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/60 bg-white/80 p-2 shadow-soft backdrop-blur">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
