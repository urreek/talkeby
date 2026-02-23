import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ObservabilitySummary } from "@/lib/types";

type ObservabilityDashboardProps = {
  summary: ObservabilitySummary | null;
};

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString();
}

export function ObservabilityDashboard({ summary }: ObservabilityDashboardProps) {
  if (!summary) {
    return null;
  }

  return (
    <Card className="theme-surface">
      <CardHeader>
        <CardTitle>Observability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Jobs (window)" value={formatNumber(summary.jobs.total)} />
          <Metric label="Success Rate" value={formatPercent(summary.jobs.successRate)} />
          <Metric label="P95 Duration" value={`${summary.jobs.p95DurationSeconds.toFixed(1)}s`} />
          <Metric label="Throughput 24h" value={formatNumber(summary.jobs.throughputLast24h)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Queue Avg" value={`${summary.jobs.avgQueueWaitSeconds.toFixed(1)}s`} />
          <Metric label="Running" value={formatNumber(summary.jobs.running)} />
          <Metric label="Pending Runtime" value={formatNumber(summary.runtimeApprovals.pending)} />
          <Metric label="Approval Avg" value={`${summary.runtimeApprovals.avgDecisionSeconds.toFixed(1)}s`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
