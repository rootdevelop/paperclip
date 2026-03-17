import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScheduledTask } from "@paperclipai/shared";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { scheduledTasksApi } from "../api/scheduled-tasks";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";

interface AgentOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily at 9am", value: "0 9 * * *" },
  { label: "Daily at 6pm", value: "0 18 * * *" },
  { label: "Every weekday at 9am", value: "0 9 * * 1-5" },
  { label: "Weekly (Monday 9am)", value: "0 9 * * 1" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
];

interface ScheduledTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTask?: ScheduledTask | null;
}

export function ScheduledTaskDialog({ open, onOpenChange, editTask }: ScheduledTaskDialogProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cronExpression, setCronExpression] = useState("0 9 * * *");
  const [assigneeAgentId, setAssigneeAgentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("medium");

  useEffect(() => {
    if (editTask) {
      setTitle(editTask.title);
      setDescription(editTask.description ?? "");
      setCronExpression(editTask.cronExpression);
      setAssigneeAgentId(editTask.assigneeAgentId);
      setProjectId(editTask.projectId ?? "");
      setPriority(editTask.priority);
    } else {
      setTitle("");
      setDescription("");
      setCronExpression("0 9 * * *");
      setAssigneeAgentId("");
      setProjectId("");
      setPriority("medium");
    }
  }, [editTask, open]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: async () => {
      const { api } = await import("../api/client");
      return api.get<AgentOption[]>(`/companies/${selectedCompanyId}/agents`);
    },
    enabled: !!selectedCompanyId && open,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: async () => {
      const { api } = await import("../api/client");
      return api.get<ProjectOption[]>(`/companies/${selectedCompanyId}/projects`);
    },
    enabled: !!selectedCompanyId && open,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      scheduledTasksApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledTasks.list(selectedCompanyId!) });
      onOpenChange(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      scheduledTasksApi.update(editTask!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledTasks.list(selectedCompanyId!) });
      onOpenChange(false);
    },
  });

  function handleSubmit() {
    const data: Record<string, unknown> = {
      title,
      description: description || null,
      cronExpression,
      assigneeAgentId,
      priority,
      projectId: projectId || null,
    };

    if (editTask) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isValid = title.trim() && cronExpression.trim() && assigneeAgentId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">
            {editTask ? "Edit Scheduled Task" : "New Scheduled Task"}
          </span>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              placeholder="Optional description (used as issue body)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Schedule (Cron)</label>
            <div className="flex gap-2">
              <Input
                placeholder="0 9 * * *"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                className="flex-1"
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                value=""
                onChange={(e) => {
                  if (e.target.value) setCronExpression(e.target.value);
                }}
              >
                <option value="">Presets...</option>
                {CRON_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Assigned Agent</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={assigneeAgentId}
              onChange={(e) => setAssigneeAgentId(e.target.value)}
            >
              <option value="">Select agent...</option>
              {agents?.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Project (optional)</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">None</option>
                {projects?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!isValid || isPending}
          >
            {editTask ? "Save" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
