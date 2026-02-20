import { useEffect, useState } from "react";

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
import type { ProjectInfo } from "@/lib/types";

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
  const [task, setTask] = useState("");
  const [projectName, setProjectName] = useState(activeProject);
  const resolvedProjectValue = projects.some(
    (project) => project.name === projectName,
  )
    ? projectName
    : (projects[0]?.name ?? "");

  useEffect(() => {
    if (projects.some((project) => project.name === activeProject)) {
      setProjectName(activeProject);
      return;
    }
    if (projects.length > 0) {
      setProjectName(projects[0].name);
    }
  }, [activeProject, projects]);

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
          <Select value={resolvedProjectValue} onValueChange={setProjectName}>
            <SelectTrigger className="h-12 bg-background/50 font-medium text-foreground transition-colors hover:bg-background/80 focus:ring-primary focus:ring-offset-2">
              <SelectValue
                className="text-foreground"
                placeholder="Choose project"
              />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-popover/95 text-popover-foreground backdrop-blur-xl">
              {projects.map((project) => (
                <SelectItem
                  className="cursor-pointer transition-colors focus:bg-primary/20 focus:text-primary"
                  key={project.name}
                  value={project.name}
                >
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
