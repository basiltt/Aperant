/**
 * AskUserQuestion Tool
 * ====================
 *
 * Asks multiple-choice questions to gather requirements or clarify ambiguity.
 * In Aperant's desktop context, this queues a question for the UI to present.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Pending questions queue (consumed by the UI layer)
// ---------------------------------------------------------------------------

export interface PendingQuestion {
  id: string;
  question: string;
  header: string;
  options: Array<{ label: string; description: string; markdown?: string }>;
  multiSelect: boolean;
  answer?: string;
  answeredAt?: number;
}

const pendingQuestions: PendingQuestion[] = [];
let questionIdCounter = 0;

/** Exported for UI consumption */
export function getPendingQuestions(): PendingQuestion[] {
  return pendingQuestions;
}

/** Mark a question as answered (called from UI IPC handler) */
export function answerQuestion(id: string, answer: string): boolean {
  const q = pendingQuestions.find((pq) => pq.id === id);
  if (q) {
    q.answer = answer;
    q.answeredAt = Date.now();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().describe('The complete question to ask the user'),
        header: z.string().describe('Very short label displayed as a chip/tag (max 12 chars)'),
        options: z
          .array(
            z.object({
              label: z.string().describe('Display text for this option (1-5 words)'),
              description: z.string().describe('Explanation of what this option means'),
              markdown: z.string().optional().describe('Optional preview content'),
            }),
          )
          .min(2)
          .max(4)
          .describe('Available choices (2-4 options)'),
        multiSelect: z.boolean().describe('Whether multiple options can be selected'),
      }),
    )
    .min(1)
    .max(4)
    .describe('Questions to ask the user (1-4 questions)'),
});

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const askUserQuestionTool = Tool.define({
  metadata: {
    name: 'AskUserQuestion',
    description:
      'Asks multiple-choice questions to gather user preferences, clarify ambiguous instructions, or get decisions on implementation choices.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (input, _context) => {
    const results: PendingQuestion[] = [];

    for (const q of input.questions) {
      const id = `question_${++questionIdCounter}`;
      const pending: PendingQuestion = {
        id,
        question: q.question,
        header: q.header,
        options: q.options,
        multiSelect: q.multiSelect,
      };
      pendingQuestions.push(pending);
      results.push(pending);
    }

    return JSON.stringify({
      status: 'questions_queued',
      count: results.length,
      question_ids: results.map((r) => r.id),
      message: `${results.length} question(s) queued for user input.`,
    });
  },
});
