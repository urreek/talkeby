import { ChevronDown, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ProjectInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatProjectPath(path: string) {
  const normalized = String(path || "").trim();
  if (!normalized) return "Path not available";
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length <= 2 ? normalized : `.../${parts.slice(-2).join("/")}`;
}

type ProjectListItemProps = {
  project: ProjectInfo;
  isActive: boolean;
  deleting: boolean;
  onClick: () => void;
  onDelete: () => void;
};

export function ProjectListItem({ project, isActive, deleting, onClick, onDelete }: ProjectListItemProps) {
  return (
    <div className={cn(
      "flex w-full items-center gap-1 rounded-2xl border pr-2 transition-all",
      isActive
        ? "border-primary/40 bg-primary/10 shadow-sm shadow-primary/10"
        : "border-border/50 bg-muted/20 hover:border-primary/20 hover:bg-muted/40",
    )}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={isActive}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{formatProjectPath(project.path)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isActive ? (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Active</Badge>
          ) : null}
          <ChevronDown className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isActive ? "rotate-0 text-primary" : "-rotate-90",
          )} />
        </div>
      </button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
        aria-label={`Delete project ${project.name}`}
        title={`Delete project ${project.name}`}
        disabled={deleting}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
