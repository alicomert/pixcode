import { CronExpressionParser } from 'cron-parser';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ASSISTANT_NAME, SCHEDULER_POLL_INTERVAL, TIMEZONE } from './config.js';
import {
  AgentRunOutput,
  runAgentForGroup,
  writeTasksSnapshot,
} from './agent-manager.js';
import {
  deleteTask,
  getAllTasks,
  getDueTasks,
  getTaskById,
  logTaskRun,
  updateTask,
  updateTaskAfterRun,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup, ScheduledTask } from './types.js';

/** Archive completed once-tasks under ~/.pixcode/nanoclaw/archives (then delete live row). */
function archiveAndDeleteOnceTask(
  task: ScheduledTask,
  lastResult: string,
  status: 'success' | 'error',
): void {
  if (task.schedule_type !== 'once') return;
  try {
    const home = process.env.PIXCODE_HOME || path.join(os.homedir(), '.pixcode');
    const day = new Date().toISOString().slice(0, 10);
    const dir = path.join(home, 'nanoclaw', 'archives', day);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${task.id}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          ...task,
          archivedAt: new Date().toISOString(),
          runStatus: status,
          last_result: lastResult,
        },
        null,
        2,
      ),
      'utf8',
    );
    deleteTask(task.id);
    logger.info({ taskId: task.id, file }, 'Once-task archived and removed from active schedule');
  } catch (err) {
    logger.warn({ taskId: task.id, err }, 'Failed to archive once-task (left as completed)');
  }
}

// Test helper to reset scheduler state
let currentSchedulerTimeout: ReturnType<typeof setTimeout> | null = null;
export function _resetSchedulerLoopForTests(): void {
  if (currentSchedulerTimeout) {
    clearTimeout(currentSchedulerTimeout);
    currentSchedulerTimeout = null;
  }
}

/**
 * Compute the next run time for a recurring task, anchored to the
 * task's scheduled time rather than Date.now() to prevent cumulative
 * drift on interval-based tasks.
 *
 * Co-authored-by: @community-pr-601
 */
export function computeNextRun(task: ScheduledTask): string | null {
  if (task.schedule_type === 'once') return null;

  const now = Date.now();

  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    return interval.next().toISOString();
  }

  if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    if (!ms || ms <= 0) {
      // Guard against malformed interval that would cause an infinite loop
      logger.warn(
        { taskId: task.id, value: task.schedule_value },
        'Invalid interval value',
      );
      return new Date(now + 60_000).toISOString();
    }
    // Anchor to the scheduled time, not now, to prevent drift.
    // Skip past any missed intervals so we always land in the future.
    let next = new Date(task.next_run!).getTime() + ms;
    while (next <= now) {
      next += ms;
    }
    return new Date(next).toISOString();
  }

  return null;
}

export interface SchedulerDependencies {
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  queue: GroupQueue;
  sendMessage: (jid: string, text: string) => Promise<void>;
}

async function runTask(
  task: ScheduledTask,
  deps: SchedulerDependencies,
): Promise<void> {
  const startTime = Date.now();
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(task.group_folder);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Stop retry churn for malformed legacy rows.
    updateTask(task.id, { status: 'paused' });
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder, error },
      'Task has invalid group folder',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error,
    });
    return;
  }
  fs.mkdirSync(groupDir, { recursive: true });

  logger.info(
    { taskId: task.id, group: task.group_folder },
    'Running scheduled task',
  );

  const groups = deps.registeredGroups();
  const group = Object.values(groups).find(
    (g) => g.folder === task.group_folder,
  );

  if (!group) {
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder },
      'Group not found for task',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error: `Group not found: ${task.group_folder}`,
    });
    return;
  }

  // Update tasks snapshot for agent to read (filtered by group)
  const isMain = group.isMain === true;
  const tasks = getAllTasks();
  writeTasksSnapshot(
    task.group_folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  let result: string | null = null;
  let error: string | null = null;

  // For group context mode, use the group's current session
  const sessions = deps.getSessions();
  const sessionId =
    task.context_mode === 'group' ? sessions[task.group_folder] : undefined;

  // After the task produces a result, close the agent promptly.
  // Tasks are single-turn — no need to wait for idle timeout.
  const TASK_CLOSE_DELAY_MS = 10000;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleClose = () => {
    if (closeTimer) return; // already scheduled
    closeTimer = setTimeout(() => {
      logger.debug({ taskId: task.id }, 'Closing task agent after result');
      deps.queue.closeStdin(task.chat_jid);
    }, TASK_CLOSE_DELAY_MS);
  };

  try {
    // Run the task using the in-process agent
    const output = await runAgentForGroup(
      group,
      {
        prompt: task.prompt,
        sessionId,
        groupFolder: task.group_folder,
        chatJid: task.chat_jid,
        isMain,
        isScheduledTask: true,
        assistantName: ASSISTANT_NAME,
      },
      async (streamedOutput: AgentRunOutput) => {
        if (streamedOutput.result) {
          result = streamedOutput.result;
          // Forward result to user (sendMessage handles formatting)
          await deps.sendMessage(task.chat_jid, streamedOutput.result);
          scheduleClose();
        }
        if (streamedOutput.status === 'success') {
          deps.queue.notifyIdle(task.chat_jid);
          scheduleClose(); // Close promptly even when result is null (e.g. IPC-only tasks)
        }
        if (streamedOutput.status === 'error') {
          error = streamedOutput.error || 'Unknown error';
        }
      },
    );

    if (closeTimer) clearTimeout(closeTimer);

    if (output.status === 'error') {
      error = output.error || 'Unknown error';
    }

    // Log the result
    const duration = Date.now() - startTime;
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: duration,
      status: error ? 'error' : 'success',
      result,
      error,
    });

    // Update the task for the next run
    const nextRun = computeNextRun(task);
    const stored = error || (result !== null ? JSON.stringify({ result }) : '{}');
    updateTaskAfterRun(task.id, nextRun, stored);
    // One-shot jobs: archive under ~/.pixcode/nanoclaw/archives then remove live row
    if (!nextRun && task.schedule_type === 'once') {
      archiveAndDeleteOnceTask(task, stored, error ? 'error' : 'success');
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ taskId: task.id, error: err }, 'Task execution failed');

    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: duration,
      status: 'error',
      result: null,
      error: errorMessage,
    });

    // Update the task even on error so it doesn't get stuck
    const nextRun = computeNextRun(task);
    const stored = JSON.stringify({ error: errorMessage });
    updateTaskAfterRun(task.id, nextRun, stored);
    if (!nextRun && task.schedule_type === 'once') {
      archiveAndDeleteOnceTask(task, stored, 'error');
    }
  }
}

export function startSchedulerLoop(deps: SchedulerDependencies): void {
  // Start the scheduler loop
  const poll = async (): Promise<void> => {
    try {
      const dueTasks = getDueTasks();
      logger.trace({ dueTaskCount: dueTasks.length }, 'Scheduler poll');

      for (const task of dueTasks) {
        if (task.status !== 'active') continue;

        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== 'active') {
          // Task was paused/cancelled while in queue
          continue;
        }

        // Run the task (don't await - let tasks run in parallel)
        runTask(currentTask, deps).catch((err) => {
          logger.error({ taskId: task.id, error: err }, 'Task runner crashed');
        });
      }
    } catch (err) {
      logger.error({ error: err }, 'Scheduler loop error');
    }

    currentSchedulerTimeout = setTimeout(poll, SCHEDULER_POLL_INTERVAL);
  };

  currentSchedulerTimeout = setTimeout(poll, 0);
}
