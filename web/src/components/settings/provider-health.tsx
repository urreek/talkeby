import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchDoctor } from "@/lib/api";
import type { ProviderHealthCheck } from "@/lib/types";

const DISPLAY_NAMES: Record<string, string> = {
  codex: "OpenAI Codex",
  claude: "Claude Code",
  gemini: "Gemini CLI",
  groq: "Groq (Free Tier)",
  openrouter: "OpenRouter (Free Models)",
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        ok
          ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
          : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
      }`}
    />
  );
}

function ProviderRow({ check }: { check: ProviderHealthCheck }) {
  return (
    <div
      className={`flex flex-col gap-2 overflow-hidden rounded-lg border px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${
        check.active
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-background"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusDot ok={check.ready} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {DISPLAY_NAMES[check.provider] ?? check.provider}
            {check.active ? (
              <span className="ml-2 text-xs text-primary">(active)</span>
            ) : null}
          </p>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              {check.binaryInstalled ? "OK" : "X"}{" "}
              <code
                className="inline-block max-w-full truncate rounded bg-muted px-1 align-middle sm:max-w-[240px]"
                title={check.binary}
              >
                {check.binary}
              </code>
            </span>
            {check.envKey ? (
              <span>
                {check.apiKeySet ? "OK" : "X"}{" "}
                <code className="break-all rounded bg-muted px-1">{check.envKey}</code>
              </span>
            ) : (
              <span className="text-emerald-500/70">OK Built-in auth</span>
            )}
          </div>
        </div>
      </div>
      <span
        className={`text-xs font-medium ${
          check.ready ? "text-emerald-600" : "text-red-500"
        }`}
      >
        {check.ready ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}

export function ProviderHealth() {
  const doctorQuery = useQuery({
    queryKey: ["doctor"],
    queryFn: fetchDoctor,
    refetchInterval: 30_000,
  });

  if (doctorQuery.isLoading) {
    return (
      <Card className="theme-surface min-w-0">
        <CardHeader>
          <CardTitle>Provider Health</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Checking...</p>
        </CardContent>
      </Card>
    );
  }

  const data = doctorQuery.data;
  if (!data) {
    return null;
  }

  return (
    <Card className="theme-surface min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Provider Health
          <StatusDot ok={data.ok} />
        </CardTitle>
        <CardDescription>
          CLI binary and API key status for each provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.summary ? (
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            System checks: failures {data.summary.failures}, warnings {data.summary.warnings}
          </div>
        ) : null}
        {data.checks && data.checks.length > 0 ? (
          <div className="space-y-1">
            {data.checks.map((check) => (
              <div
                key={check.id}
                className={`rounded border px-3 py-2 text-xs ${
                  check.ok
                    ? "border-border bg-background text-muted-foreground"
                    : check.severity === "error"
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-600"
                }`}
              >
                <p className="font-medium">{check.message}</p>
                {check.fix ? (
                  <p className="mt-1 text-[11px] opacity-80">
                    Fix: <code className="break-all rounded bg-muted px-1">{check.fix}</code>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {data.providers.map((check) => (
          <ProviderRow key={check.provider} check={check} />
        ))}
      </CardContent>
    </Card>
  );
}
