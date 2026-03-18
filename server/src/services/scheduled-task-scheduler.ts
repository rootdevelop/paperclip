import { and, eq, lte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { scheduledTasks, issues } from "@paperclipai/db";
import { parseCron, nextCronTick } from "./cron.js";
import { issueService } from "./issues.js";
import { logActivity } from "./activity-log.js";
import { publishLiveEvent } from "./live-events.js";
import { logger } from "../middleware/logger.js";
import type { heartbeatService } from "./heartbeat.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledTaskScheduler {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
}

export interface ScheduledTaskSchedulerOptions {
  db: Db;
  heartbeat: ReturnType<typeof heartbeatService>;
  tickIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TICK_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createScheduledTaskScheduler(
  options: ScheduledTaskSchedulerOptions,
): ScheduledTaskScheduler {
  const {
    db,
    heartbeat,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
  } = options;

  const log = logger.child({ service: "scheduled-task-scheduler" });
  const issueSvc = issueService(db);

  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let tickInProgress = false;

  async function tick(): Promise<void> {
    if (tickInProgress) {
      log.debug("skipping tick — previous tick still in progress");
      return;
    }

    tickInProgress = true;

    try {
      const now = new Date();

      const dueTasks = await db
        .select()
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.status, "active"),
            lte(scheduledTasks.nextRunAt, now),
          ),
        );

      if (dueTasks.length === 0) return;

      log.debug({ count: dueTasks.length }, "found due scheduled tasks");

      for (const task of dueTasks) {
        try {
          await fireTask(task);
        } catch (err) {
          log.error(
            { taskId: task.id, err: err instanceof Error ? err.message : String(err) },
            "failed to fire scheduled task",
          );
        }
      }
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        "scheduled task scheduler tick error",
      );
    } finally {
      tickInProgress = false;
    }
  }

  async function fireTask(task: typeof scheduledTasks.$inferSelect): Promise<void> {
    // Overlap check: if lastIssueId points to an issue still in_progress, skip
    if (task.lastIssueId) {
      const lastIssue = await db
        .select({ status: issues.status })
        .from(issues)
        .where(eq(issues.id, task.lastIssueId))
        .then((rows) => rows[0] ?? null);

      if (lastIssue && lastIssue.status === "in_progress") {
        log.debug(
          { taskId: task.id, lastIssueId: task.lastIssueId },
          "skipping scheduled task — last issue still in progress",
        );
        // Still advance the schedule pointer so we don't keep re-checking
        await advanceSchedule(task);
        return;
      }
    }

    // Create issue via service (ensures validation, side effects, issue numbering)
    const issue = await issueSvc.create(task.companyId, {
      title: task.title,
      description: task.description,
      assigneeAgentId: task.assigneeAgentId,
      projectId: task.projectId,
      priority: task.priority,
      status: "todo",
    });

    log.info(
      { taskId: task.id, issueId: issue.id },
      "scheduled task fired — issue created",
    );

    // Wake the agent
    try {
      await heartbeat.wakeup(task.assigneeAgentId, {
        source: "timer",
        triggerDetail: "system",
        reason: `Scheduled task: ${task.title}`,
        contextSnapshot: {
          issueId: issue.id,
          ...(task.projectId ? { projectId: task.projectId } : {}),
          wakeReason: "issue_assigned",
        },
      });
    } catch (err) {
      log.warn(
        { taskId: task.id, agentId: task.assigneeAgentId, err: err instanceof Error ? err.message : String(err) },
        "failed to wake agent for scheduled task",
      );
    }

    // Log activity
    await logActivity(db, {
      companyId: task.companyId,
      actorType: "system",
      actorId: "scheduled-task-scheduler",
      action: "scheduled_task.fired",
      entityType: "scheduled_task",
      entityId: task.id,
      details: { issueId: issue.id, title: task.title },
    });

    // Publish live event
    publishLiveEvent({
      companyId: task.companyId,
      type: "scheduled_task.fired",
      payload: { scheduledTaskId: task.id, issueId: issue.id },
    });

    // Update the scheduled task row
    const cron = parseCron(task.cronExpression);
    const nextRunAt = nextCronTick(cron, new Date());

    await db
      .update(scheduledTasks)
      .set({
        lastRunAt: new Date(),
        lastIssueId: issue.id,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(scheduledTasks.id, task.id));
  }

  async function advanceSchedule(task: typeof scheduledTasks.$inferSelect): Promise<void> {
    const cron = parseCron(task.cronExpression);
    const nextRunAt = nextCronTick(cron, new Date());

    await db
      .update(scheduledTasks)
      .set({ nextRunAt, updatedAt: new Date() })
      .where(eq(scheduledTasks.id, task.id));
  }

  function start(): void {
    if (running) return;
    running = true;
    tickTimer = setInterval(() => {
      void tick();
    }, tickIntervalMs);
    log.info({ tickIntervalMs }, "scheduled task scheduler started");
  }

  function stop(): void {
    if (tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (!running) return;
    running = false;
    log.info("scheduled task scheduler stopped");
  }

  return { start, stop, tick };
}
