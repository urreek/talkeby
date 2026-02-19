import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExecutionMode, ProjectInfo } from "@/lib/types";

type SettingsPanelProps = {
  initialChatId: string;
  mode: ExecutionMode;
  activeProject: string;
  projects: ProjectInfo[];
  onSaveChatId: (chatId: string) => void;
  onChangeMode: (mode: ExecutionMode) => void;
  onChangeProject: (projectName: string) => void;
  isUpdatingMode: boolean;
  isUpdatingProject: boolean;
};

export function SettingsPanel({
  initialChatId,
  mode,
  activeProject,
  projects,
  onSaveChatId,
  onChangeMode,
  onChangeProject,
  isUpdatingMode,
  isUpdatingProject
}: SettingsPanelProps) {
  const [chatId, setChatId] = useState(initialChatId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Chat Identity</CardTitle>
          <CardDescription>
            Use the same Telegram chat ID you allow in your backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Example: 123456789"
            value={chatId}
            onChange={(event) => setChatId(event.target.value)}
          />
          <Button className="w-full" onClick={() => onSaveChatId(chatId)}>
            Save Chat ID
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Execution Mode</CardTitle>
          <CardDescription>Interactive requires explicit approval before any run.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={mode}
            disabled={isUpdatingMode}
            onChange={(event) => onChangeMode(event.target.value as ExecutionMode)}
          >
            <option value="auto">auto</option>
            <option value="interactive">interactive</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
          <CardDescription>Choose where `codex exec` should run.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={activeProject}
            disabled={isUpdatingProject}
            onChange={(event) => onChangeProject(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.name} value={project.name}>
                {project.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
