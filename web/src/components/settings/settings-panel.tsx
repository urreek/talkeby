import { useMemo, useState } from "react";

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
  ProviderCatalogItem,
  ReasoningEffort,
} from "@/lib/types";

type SettingsPanelProps = {
  mode: ExecutionMode;
  provider: AIProvider;
  model: string;
  reasoningEffort: ReasoningEffort;
  planMode: boolean;
  codexParityMode?: boolean;
  codexSessionResumeEnabled?: boolean;
  providerCatalog: ProviderCatalogItem[];
  projectsBasePath: string;
  theme: ThemePreference;
  showLogout: boolean;
  onLogout: () => void;
  onChangeTheme: (theme: ThemePreference) => void;
  onChangeMode: (mode: ExecutionMode) => void;
  onChangeProvider: (provider: AIProvider) => void;
  onChangeModel: (model: string) => void;
  onChangeReasoningEffort: (effort: ReasoningEffort) => void;
  onChangePlanMode: (enabled: boolean) => void;
  onAddProject: (input: {
    projectName: string;
    path?: string;
  }) => Promise<void>;
  isUpdatingMode: boolean;
  isUpdatingProvider: boolean;
  isAddingProject: boolean;
  isLoggingOut: boolean;
};

export function SettingsPanel({
  mode,
  provider,
  model,
  reasoningEffort,
  planMode,
  codexParityMode,
  codexSessionResumeEnabled,
  providerCatalog,
  projectsBasePath,
  theme,
  showLogout,
  onLogout,
  onChangeTheme,
  onChangeMode,
  onChangeProvider,
  onChangeModel,
  onChangeReasoningEffort,
  onChangePlanMode,
  onAddProject,
  isUpdatingMode,
  isUpdatingProvider,
  isAddingProject,
  isLoggingOut,
}: SettingsPanelProps) {
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");

  const activeProvider = useMemo(
    () => providerCatalog.find((item) => item.id === provider) || providerCatalog[0],
    [providerCatalog, provider],
  );
  const codexConfigKnown = typeof codexParityMode === "boolean"
    && typeof codexSessionResumeEnabled === "boolean";
  const codexNativeMode = provider === "codex"
    && codexConfigKnown
    && codexParityMode === true
    && codexSessionResumeEnabled === true;

  const modelValue = model || "__default__";
  const supportsReasoning = Boolean(activeProvider?.supportsReasoningEffort);
  const supportsPlan = Boolean(activeProvider?.supportsPlanMode);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
      <Card className="theme-surface min-w-0">
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

      <Card className="theme-surface min-w-0">
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
      </div>

      <Card className="theme-surface min-w-0">
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
            {provider === "codex" && codexConfigKnown ? (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  codexNativeMode
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }`}
              >
                {codexNativeMode
                  ? "Native Codex thread mode is active. Talkeby resumes the same Codex session per thread and does not inject managed thread summaries into prompts."
                  : [
                    "Native Codex thread mode is not fully active.",
                    codexParityMode === false
                      ? "CODEX_PARITY_MODE is off, so Talkeby may inject managed thread context."
                      : "",
                    codexSessionResumeEnabled === false
                      ? "CODEX_DISABLE_SESSION_RESUME is on, so each run starts a fresh Codex session."
                      : "",
                  ].filter(Boolean).join(" ")}
              </div>
            ) : null}

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
                  {(activeProvider?.models || []).map((modelOption) => (
                    <SelectItem
                      className="text-popover-foreground"
                      key={modelOption.value || "__default__"}
                      value={modelOption.value || "__default__"}
                    >
                      {modelOption.label}{modelOption.free ? " (free)" : ""}
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

      <Card className="theme-surface min-w-0">
        <CardHeader>
          <CardTitle>Add Project</CardTitle>
          <CardDescription>
            Add a project to the workspace list.
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
              const projectPath = newProjectPath.trim();
              if (!projectName) {
                return;
              }
              await onAddProject({
                projectName,
                path: projectPath || undefined,
              });
              setNewProjectName("");
              setNewProjectPath("");
            }}
          >
            {isAddingProject ? "Adding Project..." : "Add Project"}
          </Button>
        </CardContent>
      </Card>

      {showLogout ? (
        <Card className="theme-surface min-w-0">
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>
              End the current owner session on this device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              disabled={isLoggingOut}
              onClick={onLogout}
            >
              {isLoggingOut ? "Logging Out..." : "Log Out"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
