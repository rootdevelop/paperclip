import type { ScheduledTaskStatus } from "../constants.js";

export interface ScheduledTask {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  cronExpression: string;
  assigneeAgentId: string;
  projectId: string | null;
  priority: string;
  status: ScheduledTaskStatus;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastIssueId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
