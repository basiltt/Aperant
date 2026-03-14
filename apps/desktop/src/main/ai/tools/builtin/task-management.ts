/**
 * Task Management Tools
 * =====================
 *
 * Interactive task management tools that replace TodoWrite in interactive sessions.
 * Provides TaskCreate, TaskGet, TaskList, TaskOutput, TaskStop, TaskUpdate.
 *
 * Tasks are session-scoped and stored in memory.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Session-level task store
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  dependencies?: string[];
  output?: string;
  createdAt: number;
  updatedAt: number;
}

const tasks = new Map<string, Task>();
let taskIdCounter = 0;

/** Exported for external access */
export function getTasks(): Map<string, Task> {
  return tasks;
}

// ---------------------------------------------------------------------------
// TaskCreate
// ---------------------------------------------------------------------------

const taskCreateSchema = z.object({
  title: z.string().describe('Short title for the task'),
  description: z.string().optional().describe('Detailed description of the task'),
  dependencies: z
    .array(z.string())
    .optional()
    .describe('IDs of tasks that must complete before this one'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled'])
    .optional()
    .describe('Initial status. Defaults to pending.'),
});

export const taskCreateTool = Tool.define({
  metadata: {
    name: 'TaskCreate',
    description: 'Creates a new task in the task list.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: taskCreateSchema,
  execute: async (input, _context) => {
    const id = `task_${++taskIdCounter}`;
    const now = Date.now();
    const task: Task = {
      id,
      title: input.title,
      description: input.description,
      status: input.status ?? 'pending',
      dependencies: input.dependencies,
      createdAt: now,
      updatedAt: now,
    };
    tasks.set(id, task);
    return JSON.stringify(task);
  },
});

// ---------------------------------------------------------------------------
// TaskGet
// ---------------------------------------------------------------------------

const taskGetSchema = z.object({
  task_id: z.string().describe('The task ID to get details for'),
});

export const taskGetTool = Tool.define({
  metadata: {
    name: 'TaskGet',
    description: 'Retrieves full details for a specific task.',
    permission: ToolPermission.ReadOnly,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: taskGetSchema,
  execute: async (input, _context) => {
    const task = tasks.get(input.task_id);
    if (!task) {
      return `Error: Task not found: ${input.task_id}`;
    }
    return JSON.stringify(task);
  },
});

// ---------------------------------------------------------------------------
// TaskList
// ---------------------------------------------------------------------------

const taskListSchema = z.object({
  status: z
    .enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled'])
    .optional()
    .describe('Optional filter by status'),
});

export const taskListTool = Tool.define({
  metadata: {
    name: 'TaskList',
    description: 'Lists all tasks with their current status.',
    permission: ToolPermission.ReadOnly,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: taskListSchema,
  execute: async (input, _context) => {
    let entries = Array.from(tasks.values());
    if (input.status) {
      entries = entries.filter((t) => t.status === input.status);
    }

    if (entries.length === 0) {
      return input.status ? `No tasks with status "${input.status}".` : 'No tasks.';
    }

    return JSON.stringify(entries, null, 2);
  },
});

// ---------------------------------------------------------------------------
// TaskOutput
// ---------------------------------------------------------------------------

const taskOutputSchema = z.object({
  task_id: z.string().describe('The task ID to get output from'),
  block: z.boolean().optional().describe('Whether to wait for completion. Defaults to true.'),
  timeout: z
    .number()
    .min(0)
    .max(600000)
    .optional()
    .describe('Max wait time in ms. Defaults to 30000.'),
});

export const taskOutputTool = Tool.define({
  metadata: {
    name: 'TaskOutput',
    description:
      'Retrieves output from a running or completed task. Returns the task output along with status information.',
    permission: ToolPermission.ReadOnly,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: taskOutputSchema,
  execute: async (input, _context) => {
    const task = tasks.get(input.task_id);
    if (!task) {
      return `Error: Task not found: ${input.task_id}`;
    }

    return JSON.stringify({
      id: task.id,
      status: task.status,
      output: task.output ?? null,
      title: task.title,
    });
  },
});

// ---------------------------------------------------------------------------
// TaskStop
// ---------------------------------------------------------------------------

const taskStopSchema = z.object({
  task_id: z.string().describe('The ID of the background task to stop'),
});

export const taskStopTool = Tool.define({
  metadata: {
    name: 'TaskStop',
    description: 'Stops a running background task by its ID.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: taskStopSchema,
  execute: async (input, _context) => {
    const task = tasks.get(input.task_id);
    if (!task) {
      return `Error: Task not found: ${input.task_id}`;
    }

    if (task.status === 'completed' || task.status === 'cancelled') {
      return `Task ${input.task_id} is already ${task.status}.`;
    }

    task.status = 'cancelled';
    task.updatedAt = Date.now();

    return JSON.stringify({
      id: task.id,
      status: 'cancelled',
      message: `Task ${input.task_id} has been stopped.`,
    });
  },
});

// ---------------------------------------------------------------------------
// TaskUpdate
// ---------------------------------------------------------------------------

const taskUpdateSchema = z.object({
  task_id: z.string().describe('The task ID to update'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled'])
    .optional()
    .describe('New status for the task'),
  title: z.string().optional().describe('Updated title'),
  description: z.string().optional().describe('Updated description'),
  dependencies: z.array(z.string()).optional().describe('Updated dependency list'),
  output: z.string().optional().describe('Task output/result'),
  delete: z.boolean().optional().describe('If true, delete the task entirely'),
});

export const taskUpdateTool = Tool.define({
  metadata: {
    name: 'TaskUpdate',
    description:
      'Updates task status, dependencies, details, or deletes tasks.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: taskUpdateSchema,
  execute: async (input, _context) => {
    const task = tasks.get(input.task_id);
    if (!task) {
      return `Error: Task not found: ${input.task_id}`;
    }

    if (input.delete) {
      tasks.delete(input.task_id);
      return JSON.stringify({
        id: input.task_id,
        status: 'deleted',
        message: `Task ${input.task_id} deleted.`,
      });
    }

    if (input.status) task.status = input.status;
    if (input.title) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.dependencies) task.dependencies = input.dependencies;
    if (input.output !== undefined) task.output = input.output;
    task.updatedAt = Date.now();

    return JSON.stringify(task);
  },
});
