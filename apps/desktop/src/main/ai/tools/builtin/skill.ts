/**
 * Skill Tool
 * ==========
 *
 * Executes a skill within the main conversation.
 * Skills provide specialized capabilities and domain knowledge.
 *
 * In Aperant's context, skills are customizable routines that can be
 * loaded from .claude/skills/ or the agent's skill registry.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  skill: z.string().describe('The skill name (e.g., "commit", "review-pr", "pdf")'),
  args: z.string().optional().describe('Optional arguments for the skill'),
});

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const skillTool = Tool.define({
  metadata: {
    name: 'Skill',
    description:
      'Executes a skill within the main conversation. Skills provide specialized capabilities like committing code, reviewing PRs, or processing documents. Use slash commands (e.g., /commit, /review-pr) to invoke skills.',
    permission: ToolPermission.RequiresApproval,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (input, _context) => {
    // Skill execution is a stub — actual implementation requires the skill
    // registry to be loaded with available skills from .claude/skills/
    // or the agent configuration. This tool definition ensures the model
    // can request skills and the proxy translates them correctly.

    return JSON.stringify({
      skill: input.skill,
      args: input.args ?? null,
      status: 'not_available',
      message: `Skill "${input.skill}" is not available. Configure skills in .claude/skills/ or the agent settings.`,
    });
  },
});
