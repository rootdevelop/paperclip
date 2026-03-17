import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";

export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    cronExpression: text("cron_expression").notNull(),
    assigneeAgentId: uuid("assignee_agent_id").notNull().references(() => agents.id),
    projectId: uuid("project_id").references(() => projects.id),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("active"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastIssueId: uuid("last_issue_id").references(() => issues.id),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("scheduled_tasks_company_status_idx").on(table.companyId, table.status),
    nextRunAtIdx: index("scheduled_tasks_next_run_at_idx").on(table.nextRunAt),
  }),
);
