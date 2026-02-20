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
import type { AIProvider, ExecutionMode, ProjectInfo } from "@/lib/types";

type SettingsPanelProps = {
  initialChatId: string;
  mode: ExecutionMode;
  provider: AIProvider;
  model: string;
  activeProject: string;
  projects: ProjectInfo[];
  projectsBasePath: string;
  theme: ThemePreference;
  onSaveChatId: (chatId: string) => void;
  onChangeTheme: (theme: ThemePreference) => void;
  onChangeMode: (mode: ExecutionMode) => void;
  onChangeProvider: (provider: AIProvider) => void;
  onChangeModel: (model: string) => void;
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
  activeProject,
  projects,
  projectsBasePath,
  theme,
  onSaveChatId,
  onChangeTheme,
  onChangeMode,
  onChangeProvider,
  onChangeModel,
  onChangeProject,
  onAddProject,
  isUpdatingMode,
  isUpdatingProvider,
  isUpdatingProject,
  isAddingProject,
}: SettingsPanelProps) {
  const [chatId, setChatId] = useState(initialChatId);
  const [draftModel, setDraftModel] = useState(model);
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
                Gemini
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Model name (leave empty for provider default)
            </p>
            <div className="flex gap-2">
              <Input
                placeholder={
                  provider === "codex"
                    ? "e.g. gpt-5.3-codex, gpt-5.2-codex"
                    : provider === "claude"
                      ? "e.g. opus-4.6, sonnet-4.6"
                      : "e.g. opus-4.6, gemini-pro-3.1"
                }
                value={draftModel}
                className="bg-background flex-1"
                onChange={(event) => setDraftModel(event.target.value)}
              />
              <Button
                variant="secondary"
                disabled={isUpdatingProvider || draftModel === model}
                onClick={() => onChangeModel(draftModel.trim())}
              >
                Save
              </Button>
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
