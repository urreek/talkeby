import { useEffect, useState } from "react";
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
import { fetchProvider, setProvider } from "@/lib/api";
import { getStoredChatId } from "@/lib/storage";
import type { AIProvider, ProjectInfo } from "@/lib/types";

const PROVIDER_LABELS: Record<string, string> = {
  codex: "OpenAI Codex",
  claude: "Claude Code",
  gemini: "Gemini CLI",
};

const MODELS_BY_PROVIDER: Record<
  AIProvider,
  { value: string; label: string }[]
> = {
  codex: [
    { value: "__default__", label: "Default" },
    { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  ],
  claude: [
    { value: "__default__", label: "Default" },
    { value: "opus-4.6", label: "Opus 4.6" },
    { value: "sonnet-4.6", label: "Sonnet 4.6" },
  ],
  gemini: [
    { value: "__default__", label: "Default" },
    { value: "opus-4.6", label: "Opus 4.6" },
    { value: "gemini-pro-3.1", label: "Gemini Pro 3.1" },
  ],
};

type CreateJobFormProps = {
  projects: ProjectInfo[];
  activeProject: string;
  isSubmitting: boolean;
  onSubmit: (input: { task: string; projectName: string }) => Promise<void>;
};

export function CreateJobForm({
  projects,
  activeProject,
  isSubmitting,
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

  const providerData = providerQuery.data;
  const provider = providerData?.provider ?? "codex";
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;
  const currentModelValue = providerData?.model || "__default__";
  const models = MODELS_BY_PROVIDER[provider] ?? MODELS_BY_PROVIDER.codex;

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
    const chatId = getStoredChatId();
    if (!chatId) return;
    setProvider({ chatId, provider: value }).then(() =>
      queryClient.invalidateQueries({ queryKey: ["provider"] }),
    );
  };

  const handleModelChange = (value: string) => {
    const chatId = getStoredChatId();
    if (!chatId) return;
    const model = value === "__default__" ? "" : value;
    setProvider({ chatId, model }).then(() =>
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
            await onSubmit({
              task: cleanTask,
              projectName: resolvedProjectValue,
            });
            setTask("");
          }}
        >
          <Textarea
            placeholder="Example: add optimistic update to the jobs list and write tests"
            value={task}
            className="min-h-[100px] resize-none bg-background/50 font-medium placeholder:text-muted-foreground/50 focus-visible:ring-primary focus-visible:ring-offset-2"
            onChange={(event) => setTask(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-10 bg-background/50 text-sm font-medium text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-2">
                <SelectValue
                  className="text-foreground"
                  placeholder="Provider"
                />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-popover/95 text-popover-foreground backdrop-blur-xl">
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  value="codex"
                >
                  OpenAI Codex
                </SelectItem>
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  value="claude"
                >
                  Claude Code
                </SelectItem>
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  value="gemini"
                >
                  Gemini CLI
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={currentModelValue} onValueChange={handleModelChange}>
              <SelectTrigger className="h-10 bg-background/50 text-sm font-medium text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-2">
                <SelectValue className="text-foreground" placeholder="Model" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-popover/95 text-popover-foreground backdrop-blur-xl">
                {models.map((m) => (
                  <SelectItem
                    className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                    key={m.value}
                    value={m.value}
                  >
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/20 transition-all active:scale-95"
            disabled={isSubmitting || !task.trim()}
          >
            {isSubmitting ? "Submitting..." : "Run Task"}
            <span className="ml-2 opacity-70">→</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
