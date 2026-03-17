import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ScheduledTask } from "@paperclipai/shared";
import { scheduledTasksApi } from "../api/scheduled-tasks";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ScheduledTaskDialog } from "../components/ScheduledTaskDialog";
import { Button } from "@/components/ui/button";
import { Clock, Plus, Play, Pause, Trash2, Pencil, Zap } from "lucide-react";

function cronToHuman(cron: string): string {
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;

  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") return "Every hour";
  if (min === "0" && dom === "*" && mon === "*" && dow === "*") return `Daily at ${hour}:00`;
  if (min === "0" && dom === "*" && mon === "*" && dow === "1-5") return `Weekdays at ${hour}:00`;
  if (min === "0" && dom === "*" && mon === "*" && dow === "1") return `Weekly (Mon ${hour}:00)`;
  if (min?.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*")
    return `Every ${min.slice(2)} min`;
  if (min === "0" && hour?.startsWith("*/") && dom === "*" && mon === "*" && dow === "*")
    return `Every ${hour.slice(2)} hours`;

  return cron;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduledTasks() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Schedules" }]);
  }, [setBreadcrumbs]);

  const { data: tasks, isLoading } = useQuery({
    queryKey: queryKeys.scheduledTasks.list(selectedCompanyId!),
    queryFn: () => scheduledTasksApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: async () => {
      const { api } = await import("../api/client");
      return api.get<{ id: string; name: string }[]>(`/companies/${selectedCompanyId}/agents`);
    },
    enabled: !!selectedCompanyId,
  });

  const agentMap = new Map(agents?.map((a) => [a.id, a.name]) ?? []);

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      scheduledTasksApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledTasks.list(selectedCompanyId!) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scheduledTasksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledTasks.list(selectedCompanyId!) });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => scheduledTasksApi.trigger(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledTasks.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Clock} message="Select a company to view schedules." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  function openCreate() {
    setEditTask(null);
    setDialogOpen(true);
  }

  function openEdit(task: ScheduledTask) {
    setEditTask(task);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      {tasks && tasks.length === 0 && (
        <EmptyState
          icon={Clock}
          message="No scheduled tasks yet."
          action="New Scheduled Task"
          onAction={openCreate}
        />
      )}

      {tasks && tasks.length > 0 && (
        <>
          <div className="flex items-center justify-start">
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Scheduled Task
            </Button>
          </div>

          <div className="rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Schedule</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Agent</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Next Run</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Run</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{task.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span title={task.cronExpression}>{cronToHuman(task.cronExpression)}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {agentMap.get(task.assigneeAgentId) ?? task.assigneeAgentId.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          task.status === "active"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                        }`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {formatDate(task.nextRunAt)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {formatDate(task.lastRunAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Edit"
                          onClick={() => openEdit(task)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title={task.status === "active" ? "Pause" : "Resume"}
                          onClick={() =>
                            toggleStatusMutation.mutate({
                              id: task.id,
                              status: task.status === "active" ? "paused" : "active",
                            })
                          }
                        >
                          {task.status === "active" ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Trigger now"
                          onClick={() => triggerMutation.mutate(task.id)}
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Delete this scheduled task?")) {
                              deleteMutation.mutate(task.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ScheduledTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTask={editTask}
      />
    </div>
  );
}
