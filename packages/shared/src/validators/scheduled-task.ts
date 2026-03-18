import { z } from "zod";
import { ISSUE_PRIORITIES } from "../constants.js";

export const createScheduledTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  cronExpression: z.string().min(1),
  assigneeAgentId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  priority: z.enum(ISSUE_PRIORITIES).optional().default("medium"),
});

export type CreateScheduledTask = z.infer<typeof createScheduledTaskSchema>;

export const updateScheduledTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  cronExpression: z.string().min(1).optional(),
  assigneeAgentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional().nullable(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

export type UpdateScheduledTask = z.infer<typeof updateScheduledTaskSchema>;
