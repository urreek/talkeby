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
import type { ExecutionMode, ProjectInfo } from "@/lib/types";

type SettingsPanelProps = {
  initialChatId: string;
  mode: ExecutionMode;
  activeProject: string;
  projects: ProjectInfo[];
  projectsBasePath: string;
  theme: ThemePreference;
  onSaveChatId: (chatId: string) => void;
  onChangeTheme: (theme: ThemePreference) => void;
  onChangeMode: (mode: ExecutionMode) => void;
  onChangeProject: (projectName: string) => void;
  onAddProject: (input: {
    projectName: string;
    path?: string;
  }) => Promise<void>;
  isUpdatingMode: boolean;
  isUpdatingProject: boolean;
  isAddingProject: boolean;
};

export function SettingsPanel({
  initialChatId,
  mode,
  activeProject,
  projects,
  projectsBasePath,
  theme,
  onSaveChatId,
  onChangeTheme,
  onChangeMode,
  onChangeProject,
  onAddProject,
  isUpdatingMode,
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
          <CardTitle>Project</CardTitle>
          <CardDescription>
            Choose where `codex exec` should run.
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
