import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { scheduledTasks } from "@paperclipai/db";
import { createScheduledTaskSchema, updateScheduledTaskSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { scheduledTaskService, issueService, logActivity, publishLiveEvent, heartbeatService } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { parseCron, nextCronTick } from "../services/cron.js";

export function scheduledTaskRoutes(db: Db) {
  const router = Router();
  const svc = scheduledTaskService(db);
  const issueSvc = issueService(db);
  const heartbeat = heartbeatService(db);

  // List all scheduled tasks for a company
  router.get("/companies/:companyId/scheduled-tasks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.list(companyId);
    res.json(result);
  });

  // Get a single scheduled task
  router.get("/scheduled-tasks/:id", async (req, res) => {
    const id = req.params.id as string;
    const task = await svc.getById(id);
    if (!task) {
      res.status(404).json({ error: "Scheduled task not found" });
      return;
    }
    assertCompanyAccess(req, task.companyId);
    res.json(task);
  });

  // Create a new scheduled task
  router.post(
    "/companies/:companyId/scheduled-tasks",
    validate(createScheduledTaskSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const actor = getActorInfo(req);
      const task = await svc.create(companyId, {
        ...req.body,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
      });

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "scheduled_task.created",
        entityType: "scheduled_task",
        entityId: task.id,
        details: { title: task.title },
      });

      res.status(201).json(task);
    },
  );

  // Update a scheduled task
  router.patch(
    "/scheduled-tasks/:id",
    validate(updateScheduledTaskSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Scheduled task not found" });
        return;
      }
      assertCompanyAccess(req, existing.companyId);

      const task = await svc.update(id, req.body);
      if (!task) {
        res.status(404).json({ error: "Scheduled task not found" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: task.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "scheduled_task.updated",
        entityType: "scheduled_task",
        entityId: task.id,
        details: req.body,
      });

      res.json(task);
    },
  );

  // Delete a scheduled task
  router.delete("/scheduled-tasks/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Scheduled task not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const task = await svc.remove(id);
    if (!task) {
      res.status(404).json({ error: "Scheduled task not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: task.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "scheduled_task.deleted",
      entityType: "scheduled_task",
      entityId: task.id,
    });

    res.json(task);
  });

  // Manual trigger — fire a scheduled task now
  router.post("/scheduled-tasks/:id/trigger", async (req, res) => {
    const id = req.params.id as string;
    const task = await svc.getById(id);
    if (!task) {
      res.status(404).json({ error: "Scheduled task not found" });
      return;
    }
    assertCompanyAccess(req, task.companyId);

    // Create the issue
    const issue = await issueSvc.create(task.companyId, {
      title: task.title,
      description: task.description,
      assigneeAgentId: task.assigneeAgentId,
      projectId: task.projectId,
      priority: task.priority,
      status: "todo",
    });

    // Wake the agent
    try {
      await heartbeat.wakeup(task.assigneeAgentId, {
        source: "timer",
        triggerDetail: "manual",
        reason: `Manual trigger: ${task.title}`,
        contextSnapshot: {
          issueId: issue.id,
          ...(task.projectId ? { projectId: task.projectId } : {}),
          wakeReason: "issue_assigned",
        },
      });
    } catch {
      // Agent wake failure is non-fatal
    }

    // Update last run info directly (bypasses zod validation)
    const cron = parseCron(task.cronExpression);
    const nextRunAt = task.status === "active" ? nextCronTick(cron, new Date()) : null;

    await db
      .update(scheduledTasks)
      .set({
        lastRunAt: new Date(),
        lastIssueId: issue.id,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(scheduledTasks.id, id));

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: task.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "scheduled_task.fired",
      entityType: "scheduled_task",
      entityId: task.id,
      details: { issueId: issue.id, manual: true },
    });

    publishLiveEvent({
      companyId: task.companyId,
      type: "scheduled_task.fired",
      payload: { scheduledTaskId: task.id, issueId: issue.id },
    });

    res.json({ scheduledTask: task, issue });
  });

  return router;
}
