/**
 * Build Tool Registry
 * ===================
 *
 * Shared helper that creates a ToolRegistry pre-populated with all builtin tools.
 * Used by worker threads, runners (insights, roadmap, ideation), and the client factory.
 */

import { ToolRegistry } from './registry';
import type { DefinedTool } from './define';

import { readTool } from './builtin/read';
import { writeTool } from './builtin/write';
import { editTool } from './builtin/edit';
import { bashTool } from './builtin/bash';
import { globTool } from './builtin/glob';
import { grepTool } from './builtin/grep';
import { webFetchTool } from './builtin/web-fetch';
import { webSearchTool } from './builtin/web-search';
import { spawnSubagentTool } from './builtin/spawn-subagent';
import { cronCreateTool } from './builtin/cron-create';
import { cronListTool } from './builtin/cron-list';
import { cronDeleteTool } from './builtin/cron-delete';
import { notebookEditTool } from './builtin/notebook-edit';
import { todoWriteTool } from './builtin/todo-write';
import { askUserQuestionTool } from './builtin/ask-user-question';
import { enterPlanModeTool, exitPlanModeTool } from './builtin/plan-mode';
import { enterWorktreeTool, exitWorktreeTool } from './builtin/worktree';
import { lspTool } from './builtin/lsp';
import { skillTool } from './builtin/skill';
import {
  taskCreateTool,
  taskGetTool,
  taskListTool,
  taskOutputTool,
  taskStopTool,
  taskUpdateTool,
} from './builtin/task-management';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDefined = (t: unknown): DefinedTool => t as DefinedTool;

/**
 * Build and return a ToolRegistry with all builtin tools registered.
 */
export function buildToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // ── Core file/shell tools ─────────────────────────────────────────────
  registry.registerTool('Read', asDefined(readTool));
  registry.registerTool('Write', asDefined(writeTool));
  registry.registerTool('Edit', asDefined(editTool));
  registry.registerTool('Bash', asDefined(bashTool));
  registry.registerTool('Glob', asDefined(globTool));
  registry.registerTool('Grep', asDefined(grepTool));

  // ── Web tools ─────────────────────────────────────────────────────────
  registry.registerTool('WebFetch', asDefined(webFetchTool));
  registry.registerTool('WebSearch', asDefined(webSearchTool));

  // ── Subagent ──────────────────────────────────────────────────────────
  registry.registerTool('SpawnSubagent', asDefined(spawnSubagentTool));

  // ── Cron scheduling tools ─────────────────────────────────────────────
  registry.registerTool('CronCreate', asDefined(cronCreateTool));
  registry.registerTool('CronList', asDefined(cronListTool));
  registry.registerTool('CronDelete', asDefined(cronDeleteTool));

  // ── Notebook tools ────────────────────────────────────────────────────
  registry.registerTool('NotebookEdit', asDefined(notebookEditTool));

  // ── Task management tools ─────────────────────────────────────────────
  registry.registerTool('TodoWrite', asDefined(todoWriteTool));
  registry.registerTool('TaskCreate', asDefined(taskCreateTool));
  registry.registerTool('TaskGet', asDefined(taskGetTool));
  registry.registerTool('TaskList', asDefined(taskListTool));
  registry.registerTool('TaskOutput', asDefined(taskOutputTool));
  registry.registerTool('TaskStop', asDefined(taskStopTool));
  registry.registerTool('TaskUpdate', asDefined(taskUpdateTool));

  // ── User interaction tools ────────────────────────────────────────────
  registry.registerTool('AskUserQuestion', asDefined(askUserQuestionTool));

  // ── Plan mode tools ───────────────────────────────────────────────────
  registry.registerTool('EnterPlanMode', asDefined(enterPlanModeTool));
  registry.registerTool('ExitPlanMode', asDefined(exitPlanModeTool));

  // ── Worktree tools ────────────────────────────────────────────────────
  registry.registerTool('EnterWorktree', asDefined(enterWorktreeTool));
  registry.registerTool('ExitWorktree', asDefined(exitWorktreeTool));

  // ── Code intelligence ─────────────────────────────────────────────────
  registry.registerTool('LSP', asDefined(lspTool));

  // ── Skill execution ───────────────────────────────────────────────────
  registry.registerTool('Skill', asDefined(skillTool));

  return registry;
}
