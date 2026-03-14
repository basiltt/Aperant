/**
 * CronDelete Tool
 * ===============
 *
 * Cancels a scheduled cron job by ID.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';
import { getCronJobs } from './cron-create';

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  id: z.string().describe('The ID of the cron job to cancel.'),
});

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const cronDeleteTool = Tool.define({
  metadata: {
    name: 'CronDelete',
    description: 'Cancels a scheduled cron job by ID.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (input, _context) => {
    const jobs = getCronJobs();
    const job = jobs.get(input.id);

    if (!job) {
      return `Error: Cron job not found: ${input.id}`;
    }

    // Clear the timer
    if (job.timerId) {
      clearInterval(job.timerId as ReturnType<typeof setInterval>);
      clearTimeout(job.timerId as ReturnType<typeof setTimeout>);
    }

    jobs.delete(input.id);

    return JSON.stringify({
      id: input.id,
      status: 'deleted',
      message: `Cron job ${input.id} has been cancelled.`,
    });
  },
});
