import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { fetchJobContext } from "@/lib/api";

function formatCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return Math.max(0, Math.round(value)).toLocaleString();
}

type JobContextInspectorProps = {
  jobId: string;
};

export function JobContextInspector({ jobId }: JobContextInspectorProps) {
  const [open, setOpen] = useState(false);

  const contextQuery = useQuery({
    queryKey: ["jobContext", jobId],
    queryFn: () => fetchJobContext(jobId),
    enabled: open && Boolean(jobId),
    staleTime: 60_000,
  });

  const context = contextQuery.data?.context ?? null;

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">Context Inspector</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px] bg-background"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}
        </Button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {contextQuery.isLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading context...</p>
          ) : contextQuery.isError ? (
            <p className="text-[11px] text-destructive">
              Could not load context: {(contextQuery.error as Error)?.message || "unknown error"}
            </p>
          ) : !context ? (
            <p className="text-[11px] text-muted-foreground">No context snapshot for this job.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {context.provider || "unknown"} · {context.model || "provider default"} · prompt {" "}
                {formatCount(context.promptEstimatedTokens)} tokens / {formatCount(context.promptChars)} chars
              </p>
              <p className="text-[11px] text-muted-foreground">
                Budget {formatCount(context.remainingBudget)} / {formatCount(context.tokenBudget)} · trimmed {context.trimmed ? "yes" : "no"} · parity {context.parityMode ? "on" : "off"}
              </p>

              <div className="space-y-2">
                {context.sections.map((section) => (
                  <div key={section.id} className="rounded border border-border/50 bg-background/60 p-2">
                    <p className="text-[11px] font-medium text-foreground">
                      {section.label} · {formatCount(section.estimatedTokens)} tok · {formatCount(section.chars)} chars
                      {section.removed ? " · removed" : ""}
                    </p>
                    {section.preview ? (
                      <pre className="mt-1 max-h-28 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
                        {section.preview}
                      </pre>
                    ) : (
                      <p className="mt-1 text-[10px] text-muted-foreground">(empty)</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded border border-border/50 bg-background/60 p-2">
                <p className="text-[11px] font-medium text-foreground">Final outbound prompt</p>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
                  {context.promptPreview || "(empty)"}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
