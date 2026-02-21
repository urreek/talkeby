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
      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
        check.active
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-background"
      }`}
    >
      <div className="flex items-center gap-3">
        <StatusDot ok={check.ready} />
        <div>
          <p className="text-sm font-medium">
            {DISPLAY_NAMES[check.provider] ?? check.provider}
            {check.active ? (
              <span className="ml-2 text-xs text-primary">(active)</span>
            ) : null}
          </p>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>
              {check.binaryInstalled ? "✓" : "✗"}{" "}
              <code className="rounded bg-muted px-1">{check.binary}</code>
            </span>
            {check.envKey ? (
              <span>
                {check.apiKeySet ? "✓" : "✗"}{" "}
                <code className="rounded bg-muted px-1">{check.envKey}</code>
              </span>
            ) : (
              <span className="text-emerald-500/70">✓ Built-in auth</span>
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
      <Card className="theme-surface">
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
    <Card className="theme-surface">
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
        {data.providers.map((check) => (
          <ProviderRow key={check.provider} check={check} />
        ))}
      </CardContent>
    </Card>
  );
}
