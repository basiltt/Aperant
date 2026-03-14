/**
 * TodoWrite Tool
 * ==============
 *
 * Manages a session task checklist for tracking progress on multi-step tasks.
 * Available in non-interactive and Agent SDK modes.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Session-level todo store (in-memory, session-scoped)
// ---------------------------------------------------------------------------

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

const sessionTodos: TodoItem[] = [];

/** Exported for external read access */
export function getSessionTodos(): readonly TodoItem[] {
  return sessionTodos;
}

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  todos: z.array(
    z.object({
      content: z.string().min(1).describe('The imperative form describing what needs to be done'),
      status: z.enum(['pending', 'in_progress', 'completed']).describe('Task status'),
      activeForm: z.string().min(1).optional().describe('Present continuous form shown during execution'),
    }),
  ).describe('The updated todo list'),
});

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const todoWriteTool = Tool.define({
  metadata: {
    name: 'TodoWrite',
    description:
      'Manages the session task checklist. Use this tool to create and update a structured task list for tracking progress on multi-step tasks. Tasks have three states: pending, in_progress, and completed.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (input, _context) => {
    // Replace the entire todo list
    sessionTodos.length = 0;
    for (const todo of input.todos) {
      sessionTodos.push({
        content: todo.content,
        status: todo.status,
        activeForm: todo.activeForm,
      });
    }

    const pending = sessionTodos.filter((t) => t.status === 'pending').length;
    const inProgress = sessionTodos.filter((t) => t.status === 'in_progress').length;
    const completed = sessionTodos.filter((t) => t.status === 'completed').length;

    return JSON.stringify({
      total: sessionTodos.length,
      pending,
      in_progress: inProgress,
      completed,
      todos: sessionTodos,
    });
  },
});
