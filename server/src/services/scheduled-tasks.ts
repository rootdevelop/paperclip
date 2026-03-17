import { desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { scheduledTasks } from "@paperclipai/db";
import { parseCron, nextCronTick, validateCron } from "./cron.js";

export function scheduledTaskService(db: Db) {
  return {
    list: (companyId: string) =>
      db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.companyId, companyId))
        .orderBy(desc(scheduledTasks.createdAt)),

    getById: (id: string) =>
      db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, id))
        .then((rows) => rows[0] ?? null),

    create: async (
      companyId: string,
      data: Omit<typeof scheduledTasks.$inferInsert, "companyId" | "nextRunAt">,
    ) => {
      const cronError = validateCron(data.cronExpression);
      if (cronError) {
        throw new Error(`Invalid cron expression: ${cronError}`);
      }

      const cron = parseCron(data.cronExpression);
      const nextRunAt = data.status === "paused" ? null : nextCronTick(cron, new Date());

      if (data.status !== "paused" && !nextRunAt) {
        throw new Error("Cron expression does not produce a valid next run time");
      }

      return db
        .insert(scheduledTasks)
        .values({ ...data, companyId, nextRunAt })
        .returning()
        .then((rows) => rows[0]);
    },

    update: async (
      id: string,
      data: Partial<typeof scheduledTasks.$inferInsert>,
    ) => {
      if (data.cronExpression) {
        const cronError = validateCron(data.cronExpression);
        if (cronError) {
          throw new Error(`Invalid cron expression: ${cronError}`);
        }
      }

      // Recompute nextRunAt when cron changes, status changes, or task is resumed
      const existing = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, id))
        .then((rows) => rows[0] ?? null);

      if (!existing) return null;

      const newStatus = data.status ?? existing.status;
      const newCron = data.cronExpression ?? existing.cronExpression;

      if (newStatus === "paused") {
        data.nextRunAt = null;
      } else if (data.cronExpression || (data.status === "active" && existing.status === "paused")) {
        const cron = parseCron(newCron);
        const computed = nextCronTick(cron, new Date());
        if (!computed) {
          throw new Error("Cron expression does not produce a valid next run time");
        }
        data.nextRunAt = computed;
      }

      return db
        .update(scheduledTasks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(scheduledTasks.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
    },

    remove: (id: string) =>
      db
        .delete(scheduledTasks)
        .where(eq(scheduledTasks.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),
  };
}
