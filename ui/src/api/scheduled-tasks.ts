import type { ScheduledTask } from "@paperclipai/shared";
import { api } from "./client";

export const scheduledTasksApi = {
  list: (companyId: string) =>
    api.get<ScheduledTask[]>(`/companies/${companyId}/scheduled-tasks`),
  get: (id: string) => api.get<ScheduledTask>(`/scheduled-tasks/${id}`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<ScheduledTask>(`/companies/${companyId}/scheduled-tasks`, data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch<ScheduledTask>(`/scheduled-tasks/${id}`, data),
  remove: (id: string) => api.delete<ScheduledTask>(`/scheduled-tasks/${id}`),
  trigger: (id: string) =>
    api.post<{ scheduledTask: ScheduledTask; issue: unknown }>(`/scheduled-tasks/${id}/trigger`, {}),
};
