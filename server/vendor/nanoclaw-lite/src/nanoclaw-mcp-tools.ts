/**
 * NanoClaw MCP Tools - Direct Implementation
 *
 * These functions implement the NanoClaw-specific tools that were previously
 * exposed via an IPC-based MCP server in container mode. In direct mode,
 * these are called as regular functions instead of MCP tool calls.
 *
 * This maintains security boundaries:
 * - Channel operations (send_message) go through the main process
 * - Database operations are mediated (no direct DB access)
 * - Group registration is main-only
 */

import path from 'path';
import { CronExpressionParser } from 'cron-parser';

import { DATA_DIR } from './config.js';
import {
  getAllTasks,
  getTasksForGroup,
  createTask,
  updateTask,
  deleteTask as dbDeleteTask,
  getTaskById,
} from './db.js';
import { logger } from './logger.js';
import { AvailableGroup } from './agent-manager.js';

import { RegisteredGroup } from './types.js';

export interface ToolContext {
  /** Current group's JID (e.g., "120363336345536173@g.us", "tg:-1001234567890") */
  chatJid: string;
  /** Current group's folder name (e.g., "whatsapp_main", "telegram_dev-team") */
  groupFolder: string;
  /** Whether this is the main group (has special privileges) */
  isMain: boolean;
  /** Callback to send a message to the user/group */
  sendMessage: (text: string, sender?: string) => Promise<void>;
  /** Callback to register a new group (main only) */
  registerGroup?: (jid: string, group: RegisteredGroup) => void | Promise<void>;
  /** Available groups (for main group's register_group tool) */
  availableGroups?: AvailableGroup[];
  /** Registered JIDs (for validation) */
  registeredJids?: Set<string>;
}

/**
 * Send a message to the user or group immediately while the agent is still running.
 * Used for progress updates or multiple messages.
 */
export async function toolSendMessage(
  text: string,
  sender: string | undefined,
  context: ToolContext,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  await context.sendMessage(text, sender);
  return { content: [{ type: 'text', text: 'Message sent.' }] };
}

/**
 * Schedule a recurring or one-time task.
 * Returns the task ID for future reference.
 */
export async function toolScheduleTask(
  args: {
    prompt: string;
    schedule_type: 'cron' | 'interval' | 'once';
    schedule_value: string;
    context_mode?: 'group' | 'isolated';
    target_group_jid?: string;
  },
  context: ToolContext,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  // Validate schedule_value before creating task
  if (args.schedule_type === 'cron') {
    try {
      CronExpressionParser.parse(args.schedule_value);
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).`,
          },
        ],
        isError: true,
      };
    }
  } else if (args.schedule_type === 'interval') {
    const ms = parseInt(args.schedule_value, 10);
    if (isNaN(ms) || ms <= 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).`,
          },
        ],
        isError: true,
      };
    }
  } else if (args.schedule_type === 'once') {
    if (
      /[Zz]$/.test(args.schedule_value) ||
      /[+-]\d{2}:\d{2}$/.test(args.schedule_value)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".`,
          },
        ],
        isError: true,
      };
    }
    const date = new Date(args.schedule_value);
    if (isNaN(date.getTime())) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".`,
          },
        ],
        isError: true,
      };
    }
  }

  // Non-main groups can only schedule for themselves
  const targetJid =
    context.isMain && args.target_group_jid
      ? args.target_group_jid
      : context.chatJid;

  // For main targeting other groups, we need to find the group folder
  let targetFolder = context.groupFolder;
  if (
    context.isMain &&
    args.target_group_jid &&
    args.target_group_jid !== context.chatJid
  ) {
    // Look up the target group's folder from registered groups
    // This would require access to registeredGroups - for now we'll
    // need to pass it in via context or look it up differently
    // For simplicity, we'll store the JID and let the scheduler resolve it
    const allTasks = getAllTasks();
    const existingTask = allTasks.find(
      (t) => t.chat_jid === args.target_group_jid,
    );
    if (existingTask) {
      targetFolder = existingTask.group_folder;
    } else {
      // Need to look up the group folder - this is a limitation
      // We'll need to pass this information differently
      logger.warn(
        { targetJid: args.target_group_jid },
        'Cannot determine group folder for target JID',
      );
    }
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Calculate next_run based on schedule_type
  let nextRun: string | null = null;
  const now = new Date();

  if (args.schedule_type === 'once') {
    nextRun = new Date(args.schedule_value).toISOString();
  } else if (args.schedule_type === 'interval') {
    nextRun = new Date(
      now.getTime() + parseInt(args.schedule_value, 10),
    ).toISOString();
  } else if (args.schedule_type === 'cron') {
    try {
      const interval = CronExpressionParser.parse(args.schedule_value);
      nextRun = interval.next().toISOString();
    } catch {
      // Already validated above, but handle gracefully
      nextRun = now.toISOString();
    }
  }

  createTask({
    id: taskId,
    group_folder: targetFolder,
    chat_jid: targetJid,
    prompt: args.prompt,
    schedule_type: args.schedule_type,
    schedule_value: args.schedule_value,
    context_mode: args.context_mode || 'group',
    next_run: nextRun,
    status: 'active',
    created_at: now.toISOString(),
  });

  return {
    content: [
      {
        type: 'text',
        text: `Task ${taskId} scheduled: ${args.schedule_type} - ${args.schedule_value}`,
      },
    ],
  };
}

/**
 * List all scheduled tasks.
 * From main: shows all tasks. From other groups: shows only that group's tasks.
 */
export async function toolListTasks(
  context: ToolContext,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const tasks = context.isMain
    ? getAllTasks()
    : getTasksForGroup(context.groupFolder);

  if (tasks.length === 0) {
    return { content: [{ type: 'text', text: 'No scheduled tasks found.' }] };
  }

  const formatted = tasks
    .map(
      (t) =>
        `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
    )
    .join('\n');

  return {
    content: [{ type: 'text', text: `Scheduled tasks:\n${formatted}` }],
  };
}

/**
 * Pause a scheduled task.
 */
export async function toolPauseTask(
  task_id: string,
  context: ToolContext,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const task = getTaskById(task_id);
  if (!task) {
    return { content: [{ type: 'text', text: `Task ${task_id} not found.` }] };
  }

  // Non-main groups can only pause their own tasks
  if (!context.isMain && task.group_folder !== context.groupFolder) {
    return {
      content: [
        { type: 'text', text: `You can only pause tasks for your own group.` },
      ],
      isError: true,
    };
  }

  updateTask(task_id, { status: 'paused' });
  return { content: [{ type: 'text', text: `Task ${task_id} paused.` }] };
}

/**
 * Resume a paused task.
 */
export async function toolResumeTask(
  task_id: string,
  context: ToolContext,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const task = getTaskById(task_id);
  if (!task) {
    return { content: [{ type: 'text', text: `Task ${task_id} not found.` }] };
  }

  // Non-main groups can only resume their own tasks
  if (!context.isMain && task.group_folder !== context.groupFolder) {
    return {
      content: [
        { type: 'text', text: `You can only resume tasks for your own group.` },
      ],
      isError: true,
    };
  }

  updateTask(task_id, { status: 'active' });
  return { content: [{ type: 'text', text: `Task ${task_id} resumed.` }] };
}

/**
 * Cancel and delete a scheduled task.
 */
export async function toolCancelTask(
  task_id: string,
  context: ToolContext,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const task = getTaskById(task_id);
  if (!task) {
    return { content: [{ type: 'text', text: `Task ${task_id} not found.` }] };
  }

  // Non-main groups can only cancel their own tasks
  if (!context.isMain && task.group_folder !== context.groupFolder) {
    return {
      content: [
        { type: 'text', text: `You can only cancel tasks for your own group.` },
      ],
      isError: true,
    };
  }

  dbDeleteTask(task_id);
  return { content: [{ type: 'text', text: `Task ${task_id} cancelled.` }] };
}

/**
 * Update an existing scheduled task.
 * Only provided fields are changed; omitted fields stay the same.
 */
export async function toolUpdateTask(
  args: {
    task_id: string;
    prompt?: string;
    schedule_type?: 'cron' | 'interval' | 'once';
    schedule_value?: string;
  },
  context: ToolContext,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const task = getTaskById(args.task_id);
  if (!task) {
    return {
      content: [{ type: 'text', text: `Task ${args.task_id} not found.` }],
    };
  }

  // Non-main groups can only update their own tasks
  if (!context.isMain && task.group_folder !== context.groupFolder) {
    return {
      content: [
        { type: 'text', text: `You can only update tasks for your own group.` },
      ],
      isError: true,
    };
  }

  // Validate schedule_value if provided
  if (args.schedule_value) {
    if (
      args.schedule_type === 'cron' ||
      (!args.schedule_type && task.schedule_type === 'cron')
    ) {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [
            { type: 'text', text: `Invalid cron: "${args.schedule_value}".` },
          ],
          isError: true,
        };
      }
    }
    if (
      args.schedule_type === 'interval' ||
      (!args.schedule_type && task.schedule_type === 'interval')
    ) {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid interval: "${args.schedule_value}".`,
            },
          ],
          isError: true,
        };
      }
    }
  }

  const updates: Partial<
    Pick<
      typeof task,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run'
    >
  > = {};

  if (args.prompt !== undefined) {
    updates.prompt = args.prompt;
  }
  if (args.schedule_type !== undefined) {
    updates.schedule_type = args.schedule_type;
  }
  if (args.schedule_value !== undefined) {
    updates.schedule_value = args.schedule_value;

    // Recalculate next_run if schedule changed
    const now = new Date();
    const scheduleType = args.schedule_type || task.schedule_type;
    const scheduleValue = args.schedule_value;

    if (scheduleType === 'once') {
      updates.next_run = new Date(scheduleValue).toISOString();
    } else if (scheduleType === 'interval') {
      updates.next_run = new Date(
        now.getTime() + parseInt(scheduleValue, 10),
      ).toISOString();
    } else if (scheduleType === 'cron') {
      try {
        const interval = CronExpressionParser.parse(scheduleValue);
        updates.next_run = interval.next().toISOString();
      } catch {
        // Already validated above
      }
    }
  }

  updateTask(args.task_id, updates);
  return { content: [{ type: 'text', text: `Task ${args.task_id} updated.` }] };
}

/**
 * Register a new chat/group so the agent can respond to messages there.
 * Main group only.
 */
export async function toolRegisterGroup(
  args: {
    jid: string;
    name: string;
    folder: string;
    trigger: string;
  },
  context: ToolContext,
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  if (!context.isMain) {
    return {
      content: [
        { type: 'text', text: 'Only the main group can register new groups.' },
      ],
      isError: true,
    };
  }

  if (!context.registerGroup) {
    return {
      content: [{ type: 'text', text: 'Group registration not available.' }],
      isError: true,
    };
  }

  // Validate the folder format (should be channel-prefixed)
  const folderMatch = args.folder.match(
    /^(whatsapp|telegram|discord|slack|gmail|x|email)_.+$/,
  );
  if (!folderMatch) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid folder format "${args.folder}". Must be channel-prefixed: {channel}_{group-name} (e.g., "whatsapp_family-chat", "telegram_dev-team").`,
        },
      ],
      isError: true,
    };
  }

  // Build the RegisteredGroup object
  const group: RegisteredGroup = {
    name: args.name,
    folder: args.folder,
    trigger: args.trigger,
    added_at: new Date().toISOString(),
  };

  await context.registerGroup(args.jid, group);
  return {
    content: [
      {
        type: 'text',
        text: `Group "${args.name}" registered. It will start receiving messages immediately.`,
      },
    ],
  };
}
