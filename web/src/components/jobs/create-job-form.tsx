import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectInfo } from "@/lib/types";

type CreateJobFormProps = {
  projects: ProjectInfo[];
  activeProject: string;
  isSubmitting: boolean;
  onSubmit: (input: { task: string; projectName: string }) => Promise<void>;
};

export function CreateJobForm({ projects, activeProject, isSubmitting, onSubmit }: CreateJobFormProps) {
  const [task, setTask] = useState("");
  const [projectName, setProjectName] = useState(activeProject);

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Task</CardTitle>
        <CardDescription>Speak to text on your phone, paste here, run remotely.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const cleanTask = task.trim();
            if (!cleanTask) {
              return;
            }
            await onSubmit({ task: cleanTask, projectName });
            setTask("");
          }}
        >
          <Textarea
            placeholder="Example: add optimistic update to the jobs list and write tests"
            value={task}
            onChange={(event) => setTask(event.target.value)}
          />
          <Select
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.name} value={project.name}>
                {project.name}
              </option>
            ))}
          </Select>
          <Button type="submit" className="w-full" disabled={isSubmitting || !task.trim()}>
            {isSubmitting ? "Submitting..." : "Run Task"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
