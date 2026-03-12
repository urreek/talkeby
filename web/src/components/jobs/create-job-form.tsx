import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  isSubmitting: boolean;
  submitError?: string;
  onSubmit: (input: { task: string; projectName: string }) => Promise<void>;
};

export function CreateJobForm({
  projects,
  activeProject,
  isSubmitting,
  submitError = "",
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
    <Card className="theme-surface relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20">
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50"
        pointer-events="none"
      />
      <CardHeader className="relative z-10 pb-4">
        <CardTitle className="text-lg font-bold">New Task</CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Speak to text on your phone, paste here, run remotely.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
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
            placeholder="Example: add optimistic update to the jobs list and write tests"
            value={task}
            className="min-h-[100px] resize-none bg-background/50 font-medium placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:ring-offset-2"
            onChange={(event) => setTask(event.target.value)}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-10 bg-background/50 text-sm font-medium text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-2">
                <SelectValue
                  className="text-foreground"
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
              <SelectTrigger className="h-10 bg-background/50 text-sm font-medium text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-2">
                <SelectValue className="text-foreground" placeholder="Model" />
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
              <SelectTrigger className="h-10 bg-background/50 text-sm font-medium text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-2">
                <SelectValue
                  className="text-foreground"
                  placeholder={supportsReasoning ? "Reasoning" : "Reasoning (n/a)"}
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
          <Button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/20 transition-all active:scale-95"
            disabled={isSubmitting || !task.trim()}
          >
            {isSubmitting ? "Submitting..." : "Run Task"}
            <span className="ml-2 opacity-70">-&gt;</span>
          </Button>
          {submitError ? (
            <p className="text-sm font-medium text-destructive">{submitError}</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
