import { useEffect, useMemo, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import type { ThemePreference } from "@/lib/storage";
import type {
  AIProvider,
  ExecutionMode,
  ProjectInfo,
  ProviderCatalogItem,
  ReasoningEffort,
} from "@/lib/types";

type SettingsPanelProps = {
  initialChatId: string;
  mode: ExecutionMode;
  provider: AIProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
  planMode: boolean;
  providerCatalog: ProviderCatalogItem[];
  activeProject: string;
  projects: ProjectInfo[];
  projectsBasePath: string;
  theme: ThemePreference;
  initialAgentProfile: string;
  onSaveChatId: (chatId: string) => void;
  onSaveAgentProfile: (profile: string) => Promise<void>;
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
  isSavingAgentProfile: boolean;
};

export function SettingsPanel({
  initialChatId,
  mode,
  provider,
  model,
  reasoningEffort,
  planMode,
  providerCatalog,
  activeProject,
  projects,
  projectsBasePath,
  theme,
  initialAgentProfile,
  onSaveChatId,
  onSaveAgentProfile,
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
  isSavingAgentProfile,
}: SettingsPanelProps) {
  const [chatId, setChatId] = useState(initialChatId);
  const [agentProfile, setAgentProfile] = useState(initialAgentProfile);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");

  const resolvedProjectValue = projects.some(
    (project) => project.name === activeProject,
  )
    ? activeProject
    : "";

  const activeProvider = useMemo(
    () => providerCatalog.find((item) => item.id === provider) || providerCatalog[0],
    [providerCatalog, provider],
  );

  const modelValue = model || "__default__";
  const supportsReasoning = Boolean(activeProvider?.supportsReasoningEffort);
  const supportsPlan = Boolean(activeProvider?.supportsPlanMode);

  useEffect(() => {
    setAgentProfile(initialAgentProfile);
  }, [initialAgentProfile]);

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
          <CardTitle>Agent Profile (New Threads)</CardTitle>
          <CardDescription>
            Applied once on the first run of each new thread.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-[140px] bg-background"
            value={agentProfile}
            onChange={(event) => setAgentProfile(event.target.value)}
            placeholder="Define how the agent should behave on the first message in new threads."
          />
          <Button
            className="w-full"
            disabled={isSavingAgentProfile}
            onClick={async () => {
              await onSaveAgentProfile(agentProfile);
            }}
          >
            {isSavingAgentProfile ? "Saving Profile..." : "Save Agent Profile"}
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
              {providerCatalog.map((item) => (
                <SelectItem className="text-popover-foreground" key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Model
              </p>
              <Select
                value={modelValue}
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
                  {(activeProvider?.models || []).map((m) => (
                    <SelectItem
                      className="text-popover-foreground"
                      key={m.value || "__default__"}
                      value={m.value || "__default__"}
                    >
                      {m.label}{m.free ? " (free)" : ""}
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
                disabled={isUpdatingProvider || !supportsReasoning}
                onValueChange={(value) =>
                  onChangeReasoningEffort(
                    value === "__default__" ? "" : (value as ReasoningEffort),
                  )
                }
              >
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue
                    className="text-foreground"
                    placeholder={supportsReasoning ? "Default" : "Not supported"}
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
                  <SelectItem className="text-popover-foreground" value="medium">
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
                disabled={isUpdatingProvider || !supportsPlan}
                onValueChange={(value) => onChangePlanMode(value === "on")}
              >
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue className="text-foreground" />
                </SelectTrigger>
                <SelectContent className="bg-popover text-popover-foreground">
                  <SelectItem className="text-popover-foreground" value="off">
                    Off - Execute directly
                  </SelectItem>
                  <SelectItem className="text-popover-foreground" value="on">
                    On - Plan only, do not execute
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
