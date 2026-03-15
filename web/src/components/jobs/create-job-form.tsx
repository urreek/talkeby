import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EditableThreadTitle } from "@/components/jobs/editable-thread-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchProvider, fetchProviderCatalog, setProvider } from "@/lib/api";
import type { AIProvider, ProjectInfo } from "@/lib/types";

type CreateJobFormProps = {
  projects: ProjectInfo[];
  activeProject: string;
  threadTitle: string;
  threadTokenCount: number;
  isSubmitting: boolean;
  submitError?: string;
  onRenameThread: (title: string) => void;
  onSubmit: (input: { task: string; projectName: string }) => Promise<void>;
};

export function CreateJobForm({
  projects,
  activeProject,
  threadTitle,
  threadTokenCount,
  isSubmitting,
  submitError = "",
  onRenameThread,
  onSubmit,
}: CreateJobFormProps) {
  const queryClient = useQueryClient();
  const [task, setTask] = useState("");
  const [projectName, setProjectName] = useState(activeProject);
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
  const currentReasoningEffort = providerData?.reasoningEffort || "__default__";

  const providerCatalog = catalogQuery.data?.providers ?? [];
  const activeProvider = useMemo(
    () => providerCatalog.find((item) => item.id === provider) || providerCatalog[0],
    [providerCatalog, provider],
  );
  const supportsReasoning = Boolean(activeProvider?.supportsReasoningEffort);

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
    setProvider({ provider: value }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["provider"] }),
    );
  };

  const handleModelChange = (value: string) => {
    const model = value === "__default__" ? "" : value;
    setProvider({ model }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["provider"] }),
    );
  };

  const handleReasoningEffortChange = (value: string) => {
    const reasoningEffort = value === "__default__" ? "" : value;
    setProvider({ reasoningEffort }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["provider"] }),
    );
  };

  return (
    <Card className="theme-surface relative overflow-hidden rounded-[1.75rem] border border-white/10 shadow-2xl shadow-black/20">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-80" />
      <CardContent className="relative z-10 p-4 sm:p-5">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <EditableThreadTitle title={threadTitle} onSave={onRenameThread} />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div className="rounded-full border border-white/10 bg-background/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {resolvedProjectValue || "No project selected"}
              </div>
              <div className="rounded-full border border-white/10 bg-background/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {threadTokenCount.toLocaleString()} tokens
              </div>
            </div>
          </div>

          <Textarea
            placeholder="Describe the change you want, the files involved, and any constraints."
            value={task}
            className="min-h-[112px] max-h-[240px] resize-y rounded-[1.5rem] border-white/10 bg-background/70 px-4 py-3 text-sm font-medium shadow-inner placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-0"
            onChange={(event) => setTask(event.target.value)}
          />

          <div className="grid grid-cols-3 gap-2">
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-9 min-w-0 rounded-lg border-white/10 bg-background/60 px-2 text-xs font-semibold text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-0">
                <SelectValue
                  className="truncate text-foreground"
                  placeholder="Provider"
                />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-popover/95 text-popover-foreground backdrop-blur-xl">
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
              <SelectTrigger className="h-9 min-w-0 rounded-lg border-white/10 bg-background/60 px-2 text-xs font-semibold text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-0">
                <SelectValue className="truncate text-foreground" placeholder="Model" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-popover/95 text-popover-foreground backdrop-blur-xl">
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
              value={currentReasoningEffort}
              disabled={!supportsReasoning}
              onValueChange={handleReasoningEffortChange}
            >
              <SelectTrigger className="h-9 min-w-0 rounded-lg border-white/10 bg-background/60 px-2 text-xs font-semibold text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-0">
                <SelectValue
                  className="truncate text-foreground"
                  placeholder={supportsReasoning ? "Reasoning" : "N/A"}
                />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-popover/95 text-popover-foreground backdrop-blur-xl">
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  value="__default__"
                >
                  Reasoning: Default
                </SelectItem>
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  value="low"
                >
                  Reasoning: Low
                </SelectItem>
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  value="medium"
                >
                  Reasoning: Medium
                </SelectItem>
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  value="high"
                >
                  Reasoning: High
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {task.trim().length > 0 ? `${task.trim().length} chars ready` : "Add task details to enable run"}
            </div>
            <Button
              type="submit"
              className="h-12 w-full rounded-xl px-6 text-base font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 sm:w-auto sm:min-w-[11rem]"
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
      </CardContent>
    </Card>
  );
}
