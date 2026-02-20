import { FolderOpen } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectInfo } from "@/lib/types";

type ProjectSelectorProps = {
  activeProject: string;
  projects: ProjectInfo[];
  isUpdating: boolean;
  onChangeProject: (projectName: string) => void;
};

export function ProjectSelector({
  activeProject,
  projects,
  isUpdating,
  onChangeProject,
}: ProjectSelectorProps) {
  if (projects.length === 0) {
    return null;
  }

  const resolvedValue = activeProject || undefined;

  return (
    <Select
      value={resolvedValue}
      disabled={isUpdating}
      onValueChange={onChangeProject}
    >
      <SelectTrigger className="h-8 bg-white/10 dark:bg-white/5 border-white/10 text-sm font-medium text-white backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 shrink-0 text-primary/70" />
          <SelectValue placeholder="Select project" />
        </div>
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
  );
}
