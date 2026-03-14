/**
 * CronCreate Tool
 * ===============
 *
 * Schedules a recurring or one-shot prompt within the current session.
 * Cron jobs are session-scoped and disappear when the app exits.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Session-level cron store (in-memory, session-scoped)
// ---------------------------------------------------------------------------

export interface CronJob {
  id: string;
  schedule: string;
  prompt: string;
  createdAt: number;
  nextRun?: number;
  timerId?: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>;
}

const cronJobs = new Map<string, CronJob>();
let cronIdCounter = 0;

/** Exported for use by CronList and CronDelete */
export function getCronJobs(): Map<string, CronJob> {
  return cronJobs;
}

// ---------------------------------------------------------------------------
// Minimal cron schedule parser (supports seconds-based intervals and one-shot)
// ---------------------------------------------------------------------------

function parseIntervalMs(schedule: string): number | null {
  // Support formats: "every 30s", "every 5m", "every 1h", "30s", "5m", "1h"
  const match = schedule.match(/(?:every\s+)?(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?)/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('s')) return value * 1000;
  if (unit.startsWith('m')) return value * 60 * 1000;
  if (unit.startsWith('h')) return value * 60 * 60 * 1000;
  return null;
}

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  schedule: z
    .string()
    .describe(
      'The schedule for the cron job. Supports interval formats like "every 30s", "every 5m", "every 1h", or "once" for one-shot execution.',
    ),
  prompt: z
    .string()
    .describe('The prompt to execute on the schedule.'),
});

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const cronCreateTool = Tool.define({
  metadata: {
    name: 'CronCreate',
    description:
      'Schedules a recurring or one-shot prompt within the current session. Cron jobs are session-scoped and disappear when the app exits.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (input, _context) => {
    const id = `cron_${++cronIdCounter}`;
    const job: CronJob = {
      id,
      schedule: input.schedule,
      prompt: input.prompt,
      createdAt: Date.now(),
    };

    const isOneShot = input.schedule.toLowerCase() === 'once';
    const intervalMs = isOneShot ? null : parseIntervalMs(input.schedule);

    if (!isOneShot && intervalMs === null) {
      return `Error: Unrecognized schedule format "${input.schedule}". Use formats like "every 30s", "every 5m", "every 1h", or "once".`;
    }

    if (isOneShot) {
      job.nextRun = Date.now();
      // One-shot: schedule to run once immediately
      job.timerId = setTimeout(() => {
        cronJobs.delete(id);
      }, 0);
    } else {
      job.nextRun = Date.now() + intervalMs!;
      // Recurring: set interval
      job.timerId = setInterval(() => {
        job.nextRun = Date.now() + intervalMs!;
      }, intervalMs!);
    }

    cronJobs.set(id, job);

    return JSON.stringify({
      id,
      schedule: input.schedule,
      prompt: input.prompt,
      status: 'created',
      message: isOneShot
        ? `One-shot cron job ${id} created.`
        : `Recurring cron job ${id} created with schedule "${input.schedule}".`,
    });
  },
});
