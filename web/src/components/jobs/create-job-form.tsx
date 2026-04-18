import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchProvider, fetchProviderCatalog, setProvider } from "@/lib/api";
import { getReasoningConfig, resolveReasoningEffort } from "@/lib/reasoning";
import type { AIProvider, ProjectInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

type CreateJobFormProps = {
  projects: ProjectInfo[];
  activeProject: string;
  activeThreadId?: string;
  isSubmitting: boolean;
  submitError?: string;
  onSubmit: (input: { task: string; projectName: string }) => Promise<void>;
  variant?: "card" | "embedded";
};

export function CreateJobForm({
  projects,
  activeProject,
  activeThreadId = "",
  isSubmitting,
  submitError = "",
  onSubmit,
  variant = "card",
}: CreateJobFormProps) {
  const queryClient = useQueryClient();
  const [task, setTask] = useState("");
  const [projectName, setProjectName] = useState(activeProject);
  const embedded = variant === "embedded";
  const resolvedProjectValue = projects.some(
    (project) => project.name === projectName,
  )
    ? projectName
    : (projects[0]?.name ?? "");

  const providerQuery = useQuery({
    queryKey: ["provider"],
    queryFn: fetchProvider,
  });

  const catalogQuery = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: fetchProviderCatalog,
  });

  const providerData = providerQuery.data;
  const provider = providerData?.provider ?? "codex";
  const currentModelValue = providerData?.model || "__default__";
  const currentReasoningEffort = providerData?.reasoningEffort || "medium";

  const providerCatalog = catalogQuery.data?.providers ?? [];
  const activeProvider = useMemo(
    () => providerCatalog.find((item) => item.id === provider) || providerCatalog[0],
    [providerCatalog, provider],
  );
  const reasoningConfig = getReasoningConfig(activeProvider, currentModelValue);
  const canSelectReasoning = reasoningConfig.canSelectReasoning;
  const resolvedReasoningEffort = resolveReasoningEffort(
    activeProvider,
    currentModelValue,
    currentReasoningEffort,
  );

  useEffect(() => {
    if (projects.some((project) => project.name === activeProject)) {
      setProjectName(activeProject);
      return;
    }
    if (projects.length > 0) {
      setProjectName(projects[0].name);
    }
  }, [activeProject, projects]);

  const handleProviderChange = (value: string) => {
    setProvider({
      provider: value,
      threadId: activeThreadId || undefined,
    }).then((response) => {
      queryClient.setQueryData(["provider"], response);
      if (activeThreadId) {
        queryClient.invalidateQueries({ queryKey: ["threadMemory", activeThreadId] });
      }
    });
  };

  const handleModelChange = (value: string) => {
    const model = value === "__default__" ? "" : value;
    const nextReasoningEffort = resolveReasoningEffort(
      activeProvider,
      value,
      currentReasoningEffort,
    );
    setProvider({
      model,
      reasoningEffort: nextReasoningEffort,
      threadId: activeThreadId || undefined,
    }).then((response) => {
      queryClient.setQueryData(["provider"], response);
      if (activeThreadId) {
        queryClient.invalidateQueries({ queryKey: ["threadMemory", activeThreadId] });
      }
    });
  };

  const handleReasoningEffortChange = (value: string) => {
    setProvider({
      reasoningEffort: value,
      threadId: activeThreadId || undefined,
    }).then((response) => {
      queryClient.setQueryData(["provider"], response);
      if (activeThreadId) {
        queryClient.invalidateQueries({ queryKey: ["threadMemory", activeThreadId] });
      }
    });
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        embedded
          ? "rounded-lg"
          : "theme-surface rounded-xl border border-border/40 shadow-2xl shadow-black/20 dark:border-white/10",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent",
          embedded ? "opacity-55" : "opacity-80",
        )}
      />
      <div className={cn("relative z-10", embedded ? "p-0" : "p-4 sm:p-5")}>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const cleanTask = task.trim();
            if (!cleanTask) {
              return;
            }
            try {
              await onSubmit({
                task: cleanTask,
                projectName: resolvedProjectValue,
              });
              setTask("");
            } catch {
              // Error is surfaced by parent mutation state.
            }
          }}
        >
          <Textarea
            placeholder="Tell me what to do boss"
            value={task}
            className="min-h-[96px] max-h-[240px] resize-y rounded-lg border-border/50 bg-background/70 px-4 py-3 text-base font-medium shadow-inner placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-0 dark:border-white/10 sm:min-h-[112px] md:text-sm"
            onChange={(event) => setTask(event.target.value)}
          />

          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-center gap-2">
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-9 min-w-0 rounded-lg border-border/50 bg-background/60 px-2 text-xs font-semibold text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-0 dark:border-white/10">
                <SelectValue
                  className="truncate text-foreground"
                  placeholder="Provider"
                />
              </SelectTrigger>
              <SelectContent className="border-border/40 bg-popover/95 text-popover-foreground backdrop-blur-xl dark:border-white/10">
                {providerCatalog.map((item) => (
                  <SelectItem
                    className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                    key={item.id}
                    value={item.id as AIProvider}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={currentModelValue} onValueChange={handleModelChange}>
              <SelectTrigger className="h-9 min-w-0 rounded-lg border-border/50 bg-background/60 px-2 text-xs font-semibold text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-0 dark:border-white/10">
                <SelectValue className="truncate text-foreground" placeholder="Model" />
              </SelectTrigger>
              <SelectContent className="border-border/40 bg-popover/95 text-popover-foreground backdrop-blur-xl dark:border-white/10">
                {(activeProvider?.models || []).map((modelOption) => (
                  <SelectItem
                    className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                    key={modelOption.value || "__default__"}
                    value={modelOption.value || "__default__"}
                  >
                    {modelOption.label}{modelOption.free ? " (free)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={canSelectReasoning ? resolvedReasoningEffort : ""}
              disabled={!canSelectReasoning}
              onValueChange={handleReasoningEffortChange}
            >
              <SelectTrigger className="h-9 min-w-0 rounded-lg border-border/50 bg-background/60 px-2 text-xs font-semibold text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-0 dark:border-white/10">
                <SelectValue
                  className="truncate text-foreground"
                  placeholder={canSelectReasoning ? "Reasoning" : "Unavailable"}
                />
              </SelectTrigger>
              <SelectContent className="border-border/40 bg-popover/95 text-popover-foreground backdrop-blur-xl dark:border-white/10">
                {reasoningConfig.options.map((option) => (
                  <SelectItem
                    className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="submit"
              className="h-9 min-w-[8.5rem] justify-self-end rounded-lg px-4 text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95"
              disabled={isSubmitting || !task.trim()}
            >
              {isSubmitting ? "Submitting..." : "Run Task"}
              <span className="ml-2 opacity-70">-&gt;</span>
            </Button>
          </div>

          {submitError ? (
            <p className="text-sm font-medium text-destructive">{submitError}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
