/**
 * CronList Tool
 * =============
 *
 * Lists all scheduled cron jobs in the current session.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';
import { getCronJobs } from './cron-create';

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({});

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const cronListTool = Tool.define({
  metadata: {
    name: 'CronList',
    description: 'Lists all scheduled cron jobs in the current session.',
    permission: ToolPermission.ReadOnly,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (_input, _context) => {
    const jobs = getCronJobs();

    if (jobs.size === 0) {
      return 'No scheduled cron jobs.';
    }

    const entries = Array.from(jobs.values()).map((job) => ({
      id: job.id,
      schedule: job.schedule,
      prompt: job.prompt,
      createdAt: new Date(job.createdAt).toISOString(),
      nextRun: job.nextRun ? new Date(job.nextRun).toISOString() : null,
    }));

    return JSON.stringify(entries, null, 2);
  },
});
