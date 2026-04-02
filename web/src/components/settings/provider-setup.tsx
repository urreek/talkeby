import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchDoctor, fetchProvider } from "@/lib/api";
import type { AIProvider } from "@/lib/types";

const DISPLAY_NAMES: Record<AIProvider, string> = {
  codex: "OpenAI Codex",
  claude: "Claude Code",
  gemini: "Gemini CLI",
  copilot: "GitHub Copilot CLI",
  groq: "Groq (Free Tier)",
  openrouter: "OpenRouter (Free Models)",
};

function providerLabel(provider: AIProvider) {
  return DISPLAY_NAMES[provider] ?? provider;
}

export function ProviderSetup() {
  const providerQuery = useQuery({
    queryKey: ["provider"],
    queryFn: fetchProvider,
  });
  const doctorQuery = useQuery({
    queryKey: ["doctor"],
    queryFn: fetchDoctor,
  });

  if (providerQuery.isLoading || doctorQuery.isLoading) {
    return (
      <Card className="theme-surface min-w-0">
        <CardHeader>
          <CardTitle>Selected Provider Setup</CardTitle>
          <CardDescription>Checking provider requirements...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const selectedProvider = providerQuery.data?.provider;
  const checks = doctorQuery.data?.providers ?? [];
  if (!selectedProvider) {
    return null;
  }

  const selected = checks.find((check) => check.provider === selectedProvider);
  if (!selected) {
    return (
      <Card className="theme-surface min-w-0 border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle>Selected Provider Setup</CardTitle>
          <CardDescription>
            Could not find setup info for {providerLabel(selectedProvider)}.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const issues: string[] = [];
  if (!selected.binaryInstalled) {
    issues.push(`Install CLI binary: ${selected.binary}`);
  }
  if (selected.envKey && !selected.apiKeySet) {
    issues.push(`Set ${selected.envKey} in backend .env and restart server`);
  }

  const ready = issues.length === 0;

  return (
    <Card
      className={`theme-surface min-w-0 ${ready ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}
    >
      <CardHeader>
        <CardTitle>Selected Provider Setup</CardTitle>
        <CardDescription>
          {providerLabel(selectedProvider)}: {ready ? "ready to run" : "setup required"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Binary: <code className="break-all rounded bg-muted px-1">{selected.binary}</code>
        </p>
        {selected.envKey ? (
          <p className="text-sm text-muted-foreground">
            Env key: <code className="break-all rounded bg-muted px-1">{selected.envKey}</code>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Env key: built-in auth</p>
        )}

        {ready ? (
          <p className="text-sm font-medium text-emerald-600">
            No action needed.
          </p>
        ) : (
          <div className="space-y-1">
            {issues.map((issue) => (
              <p key={issue} className="text-sm font-medium text-destructive">
                {issue}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
