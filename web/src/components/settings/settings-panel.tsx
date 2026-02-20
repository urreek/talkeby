import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ThemePreference } from "@/lib/storage";
import type {
  AIProvider,
  ExecutionMode,
  ProjectInfo,
  ReasoningEffort,
} from "@/lib/types";

const MODELS_BY_PROVIDER: Record<
  AIProvider,
  { value: string; label: string }[]
> = {
  codex: [
    { value: "", label: "Provider default" },
    { value: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
    { value: "gpt-5.2-codex", label: "GPT-5.2 Codex" },
  ],
  claude: [
    { value: "", label: "Provider default" },
    { value: "opus-4.6", label: "Opus 4.6" },
    { value: "sonnet-4.6", label: "Sonnet 4.6" },
  ],
  gemini: [
    { value: "", label: "Provider default" },
    { value: "opus-4.6", label: "Opus 4.6" },
    { value: "gemini-pro-3.1", label: "Gemini Pro 3.1" },
  ],
};

type SettingsPanelProps = {
  initialChatId: string;
  mode: ExecutionMode;
  provider: AIProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
  planMode: boolean;
  activeProject: string;
  projects: ProjectInfo[];
  projectsBasePath: string;
  theme: ThemePreference;
  onSaveChatId: (chatId: string) => void;
  onChangeTheme: (theme: ThemePreference) => void;
  onChangeMode: (mode: ExecutionMode) => void;
  onChangeProvider: (provider: AIProvider) => void;
  onChangeModel: (model: string) => void;
  onChangeReasoningEffort: (effort: ReasoningEffort) => void;
  onChangePlanMode: (enabled: boolean) => void;
  onChangeProject: (projectName: string) => void;
  onAddProject: (input: {
    projectName: string;
    path?: string;
  }) => Promise<void>;
  isUpdatingMode: boolean;
  isUpdatingProvider: boolean;
  isUpdatingProject: boolean;
  isAddingProject: boolean;
};

export function SettingsPanel({
  initialChatId,
  mode,
  provider,
  model,
  reasoningEffort,
  planMode,
  activeProject,
  projects,
  projectsBasePath,
  theme,
  onSaveChatId,
  onChangeTheme,
  onChangeMode,
  onChangeProvider,
  onChangeModel,
  onChangeReasoningEffort,
  onChangePlanMode,
  onChangeProject,
  onAddProject,
  isUpdatingMode,
  isUpdatingProvider,
  isUpdatingProject,
  isAddingProject,
}: SettingsPanelProps) {
  const [chatId, setChatId] = useState(initialChatId);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const resolvedProjectValue = projects.some(
    (project) => project.name === activeProject,
  )
    ? activeProject
    : "";

  return (
    <div className="space-y-4">
      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>Chat Identity</CardTitle>
          <CardDescription>
            Use the same Telegram chat ID you allow in your backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="Example: 123456789"
            value={chatId}
            className="bg-background"
            onChange={(event) => setChatId(event.target.value)}
          />
          <Button className="w-full" onClick={() => onSaveChatId(chatId)}>
            Save Chat ID
          </Button>
        </CardContent>
      </Card>

      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose between light and dark theme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={theme}
            onValueChange={(value) => onChangeTheme(value as ThemePreference)}
          >
            <SelectTrigger className="bg-background text-foreground">
              <SelectValue
                className="text-foreground"
                placeholder="Choose theme"
              />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              <SelectItem className="text-popover-foreground" value="light">
                light
              </SelectItem>
              <SelectItem className="text-popover-foreground" value="dark">
                dark
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>Execution Mode</CardTitle>
          <CardDescription>
            Interactive requires explicit approval before any run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={mode}
            disabled={isUpdatingMode}
            onValueChange={(value) => onChangeMode(value as ExecutionMode)}
          >
            <SelectTrigger className="bg-background text-foreground">
              <SelectValue
                className="text-foreground"
                placeholder="Choose mode"
              />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              <SelectItem className="text-popover-foreground" value="auto">
                auto
              </SelectItem>
              <SelectItem
                className="text-popover-foreground"
                value="interactive"
              >
                interactive
              </SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>
            Choose which AI coding agent to use for running tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={provider}
            disabled={isUpdatingProvider}
            onValueChange={(value) => onChangeProvider(value as AIProvider)}
          >
            <SelectTrigger className="bg-background text-foreground">
              <SelectValue
                className="text-foreground"
                placeholder="Choose provider"
              />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              <SelectItem className="text-popover-foreground" value="codex">
                OpenAI Codex
              </SelectItem>
              <SelectItem className="text-popover-foreground" value="claude">
                Claude Code
              </SelectItem>
              <SelectItem className="text-popover-foreground" value="gemini">
                Gemini CLI
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Model
              </p>
              <Select
                value={model}
                disabled={isUpdatingProvider}
                onValueChange={(value) => onChangeModel(value)}
              >
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue
                    className="text-foreground"
                    placeholder="Provider default"
                  />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  {MODELS_BY_PROVIDER[provider].map((m) => (
                    <SelectItem
                      className="text-popover-foreground"
                      key={m.value}
                      value={m.value || "__default__"}
                    >
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Reasoning Effort
              </p>
              <Select
                value={reasoningEffort || "__default__"}
                disabled={isUpdatingProvider}
                onValueChange={(value) =>
                  onChangeReasoningEffort(
                    value === "__default__" ? "" : (value as ReasoningEffort),
                  )
                }
              >
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue
                    className="text-foreground"
                    placeholder="Default"
                  />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem
                    className="text-popover-foreground"
                    value="__default__"
                  >
                    Default
                  </SelectItem>
                  <SelectItem className="text-popover-foreground" value="low">
                    Low
                  </SelectItem>
                  <SelectItem
                    className="text-popover-foreground"
                    value="medium"
                  >
                    Medium
                  </SelectItem>
                  <SelectItem className="text-popover-foreground" value="high">
                    High
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Plan Mode
              </p>
              <Select
                value={planMode ? "on" : "off"}
                disabled={isUpdatingProvider}
                onValueChange={(value) => onChangePlanMode(value === "on")}
              >
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue className="text-foreground" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem className="text-popover-foreground" value="off">
                    Off — Execute directly
                  </SelectItem>
                  <SelectItem className="text-popover-foreground" value="on">
                    On — Plan only, don't execute
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>Project</CardTitle>
          <CardDescription>
            Choose where the AI agent should run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={resolvedProjectValue}
            disabled={isUpdatingProject}
            onValueChange={onChangeProject}
          >
            <SelectTrigger className="bg-background text-foreground">
              <SelectValue
                className="text-foreground"
                placeholder="Choose project"
              />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              {projects.map((project) => (
                <SelectItem
                  className="text-popover-foreground"
                  key={project.name}
                  value={project.name}
                >
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="theme-surface">
        <CardHeader>
          <CardTitle>Add Project</CardTitle>
          <CardDescription>
            Add a new project. It will be selected automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Base path: {projectsBasePath || "(not configured)"}
          </p>
          <Input
            placeholder="Project name (example: mobile-app)"
            value={newProjectName}
            className="bg-background"
            onChange={(event) => setNewProjectName(event.target.value)}
          />
          <Input
            placeholder={`Folder path (optional, defaults to ${projectsBasePath || "<base-path>"}/<project-name>)`}
            value={newProjectPath}
            className="bg-background"
            onChange={(event) => setNewProjectPath(event.target.value)}
          />
          <Button
            className="w-full"
            disabled={isAddingProject || !newProjectName.trim()}
            onClick={async () => {
              const projectName = newProjectName.trim();
              const path = newProjectPath.trim();
              if (!projectName) {
                return;
              }
              await onAddProject({
                projectName,
                path: path || undefined,
              });
              setNewProjectName("");
              setNewProjectPath("");
            }}
          >
            {isAddingProject ? "Adding Project..." : "Add Project"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
