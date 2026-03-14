/**
 * Plan Mode Tools
 * ===============
 *
 * EnterPlanMode: Switches to plan mode to design an approach before coding.
 * ExitPlanMode: Presents a plan for approval and exits plan mode.
 *
 * In Aperant's context, these tools signal plan mode transitions to the
 * orchestration layer. The actual plan mode behavior is managed by the
 * build orchestrator.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Plan Mode State
// ---------------------------------------------------------------------------

let planModeActive = false;

/** Check if plan mode is currently active */
export function isPlanModeActive(): boolean {
  return planModeActive;
}

/** Reset plan mode state (called on session end) */
export function resetPlanMode(): void {
  planModeActive = false;
}

// ---------------------------------------------------------------------------
// EnterPlanMode
// ---------------------------------------------------------------------------

const enterPlanModeSchema = z.object({});

export const enterPlanModeTool = Tool.define({
  metadata: {
    name: 'EnterPlanMode',
    description:
      'Switches to plan mode to design an implementation approach before coding. In plan mode, the agent uses read-only tools to explore the codebase and design a plan.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: enterPlanModeSchema,
  execute: async (_input, _context) => {
    if (planModeActive) {
      return 'Already in plan mode.';
    }
    planModeActive = true;
    return JSON.stringify({
      status: 'plan_mode_entered',
      message: 'Entered plan mode. Use read-only tools to explore the codebase, then call ExitPlanMode when the plan is ready for approval.',
    });
  },
});

// ---------------------------------------------------------------------------
// ExitPlanMode
// ---------------------------------------------------------------------------

const exitPlanModeSchema = z.object({
  allowedPrompts: z
    .array(
      z.object({
        tool: z.enum(['Bash']).describe('The tool this prompt applies to'),
        prompt: z.string().describe('Semantic description of the action'),
      }),
    )
    .optional()
    .describe('Prompt-based permissions needed to implement the plan.'),
});

export const exitPlanModeTool = Tool.define({
  metadata: {
    name: 'ExitPlanMode',
    description:
      'Signals that the plan is ready for user review and approval. The plan should already be written to the plan file. This tool exits plan mode.',
    permission: ToolPermission.RequiresApproval,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: exitPlanModeSchema,
  execute: async (input, _context) => {
    if (!planModeActive) {
      return 'Not currently in plan mode.';
    }
    planModeActive = false;
    return JSON.stringify({
      status: 'plan_mode_exited',
      allowedPrompts: input.allowedPrompts ?? [],
      message: 'Plan mode exited. The plan is ready for user review.',
    });
  },
});
