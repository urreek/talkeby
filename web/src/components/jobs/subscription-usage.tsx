import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchProvider, fetchSubscriptionUsage } from "@/lib/api";
import type { SubscriptionUsageWindow } from "@/lib/types";

function windowLabel(minutes: number | null, fallback: string) {
  if (minutes === null || minutes <= 0) return fallback;
  if (minutes % 10080 === 0) return `${minutes / 10080} week`;
  if (minutes % 1440 === 0) return `${minutes / 1440} day`;
  if (minutes % 60 === 0) return `${minutes / 60} hour`;
  return `${minutes} minute`;
}

function UsageWindow({ window, label }: { window: SubscriptionUsageWindow; label: string }) {
  const remaining = window.remainingPercent;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{windowLabel(window.windowDurationMins, label)}</span>
        <span className="font-medium">{remaining === null ? "Unknown" : `${Math.round(remaining)}% left`}</span>
      </div>
      {remaining !== null ? (
        <div role="progressbar" aria-label={`${label} subscription usage remaining`} aria-valuenow={remaining} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={remaining <= 10 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${remaining}%` }} />
        </div>
      ) : null}
      {window.resetsAt ? <p className="text-[10px] text-muted-foreground">Resets {new Date(window.resetsAt).toLocaleString()}</p> : null}
    </div>
  );
}

export function SubscriptionUsage() {
  const providerQuery = useQuery({ queryKey: ["provider"], queryFn: fetchProvider });
  const provider = providerQuery.data?.provider ?? "codex";
  const usage = useQuery({
    queryKey: ["subscription-usage", provider],
    queryFn: () => fetchSubscriptionUsage(provider, true),
    enabled: Boolean(providerQuery.data),
    refetchInterval: provider === "codex" ? 30_000 : false,
    retry: false,
  });
  return (
    <section aria-label="Subscription usage" className="space-y-2 rounded-lg border border-border/40 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Subscription usage</p>
        {provider === "codex" ? <Button size="icon" variant="ghost" className="size-7" aria-label="Refresh subscription usage" disabled={usage.isFetching || !providerQuery.data} onClick={() => { void usage.refetch({ cancelRefetch: false }); }}><RefreshCw className="size-3.5" /></Button> : null}
      </div>
      {usage.isPending && !providerQuery.isError ? <p className="text-xs text-muted-foreground">Checking usage…</p> : null}
      {usage.isError || providerQuery.isError ? <p role="alert" className="text-xs text-destructive">Could not load subscription usage. Try refreshing.</p> : null}
      {usage.data?.status === "available" ? (
        <div className="max-h-48 space-y-3 overflow-y-auto">
          {usage.data.limits.map((bucket, index) => <div key={`${bucket.name}-${index}`} className="space-y-2">
            <p className="text-[11px] text-muted-foreground">{bucket.name}{bucket.plan ? ` · ${bucket.plan}` : ""}</p>
            {bucket.primary ? <UsageWindow window={bucket.primary} label="Primary window" /> : null}
            {bucket.secondary ? <UsageWindow window={bucket.secondary} label="Secondary window" /> : null}
          </div>)}
        </div>
      ) : usage.data ? <p className="text-xs text-muted-foreground">{usage.data.message}</p> : null}
      {provider === "claude" ? <a href="https://claude.ai/settings/usage" target="_blank" rel="noopener noreferrer" className="block text-xs font-medium text-primary underline">Open Claude usage</a> : null}
      {usage.data?.checkedAt ? <p className="text-[10px] text-muted-foreground">Updated {new Date(usage.data.checkedAt).toLocaleTimeString()}</p> : null}
    </section>
  );
}
