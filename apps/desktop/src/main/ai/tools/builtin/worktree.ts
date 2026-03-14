/**
 * Worktree Tools
 * ==============
 *
 * EnterWorktree: Creates an isolated git worktree and switches into it.
 * ExitWorktree: Exits a worktree session and returns to the original directory.
 *
 * Uses git worktree commands under the hood. Worktrees are created in
 * .claude/worktrees/ within the project directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Worktree State
// ---------------------------------------------------------------------------

interface WorktreeState {
  name: string;
  worktreePath: string;
  branchName: string;
  originalCwd: string;
}

let activeWorktree: WorktreeState | null = null;

/** Check if currently in a worktree */
export function isInWorktree(): boolean {
  return activeWorktree !== null;
}

/** Get active worktree info */
export function getActiveWorktree(): WorktreeState | null {
  return activeWorktree;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateRandomName(): string {
  const adjectives = ['bright', 'calm', 'dark', 'eager', 'fair', 'gentle', 'happy', 'keen'];
  const nouns = ['fox', 'bear', 'hawk', 'wolf', 'deer', 'owl', 'elk', 'jay'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}-${noun}-${num}`;
}

function runGit(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 30_000 }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`git ${args.join(' ')} failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// EnterWorktree
// ---------------------------------------------------------------------------

const enterWorktreeSchema = z.object({
  name: z
    .string()
    .optional()
    .describe('Optional name for the worktree. A random name is generated if not provided.'),
});

export const enterWorktreeTool = Tool.define({
  metadata: {
    name: 'EnterWorktree',
    description:
      'Creates an isolated git worktree and switches the session into it. Worktrees are created in .claude/worktrees/ with a new branch based on HEAD.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: enterWorktreeSchema,
  execute: async (input, context) => {
    if (activeWorktree) {
      return `Error: Already in worktree "${activeWorktree.name}". Exit current worktree first.`;
    }

    // Check if we're in a git repo
    try {
      runGit(['rev-parse', '--git-dir'], context.projectDir);
    } catch {
      return 'Error: Not in a git repository. Worktrees require git.';
    }

    const name = input.name ?? generateRandomName();
    const branchName = `worktree-${name}`;
    const worktreesDir = path.join(context.projectDir, '.claude', 'worktrees');
    const worktreePath = path.join(worktreesDir, name);

    // Create worktrees directory
    fs.mkdirSync(worktreesDir, { recursive: true });

    // Create worktree with new branch
    try {
      runGit(['worktree', 'add', '-b', branchName, worktreePath], context.projectDir);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error creating worktree: ${message}`;
    }

    activeWorktree = {
      name,
      worktreePath,
      branchName,
      originalCwd: context.cwd,
    };

    return JSON.stringify({
      status: 'worktree_created',
      name,
      path: worktreePath,
      branch: branchName,
      message: `Worktree "${name}" created at ${worktreePath} on branch ${branchName}.`,
    });
  },
});

// ---------------------------------------------------------------------------
// ExitWorktree
// ---------------------------------------------------------------------------

const exitWorktreeSchema = z.object({
  keep: z
    .boolean()
    .optional()
    .describe('If true, keep the worktree. If false or omitted, remove it if no changes were made.'),
});

export const exitWorktreeTool = Tool.define({
  metadata: {
    name: 'ExitWorktree',
    description:
      'Exits a worktree session and returns to the original directory. Optionally removes the worktree if no changes were made.',
    permission: ToolPermission.Auto,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema: exitWorktreeSchema,
  execute: async (input, context) => {
    if (!activeWorktree) {
      return 'Error: Not currently in a worktree.';
    }

    const wt = activeWorktree;
    const shouldKeep = input.keep ?? false;

    // Check if there are changes
    let hasChanges = false;
    try {
      const status = runGit(['status', '--porcelain'], wt.worktreePath);
      const log = runGit(['log', '--oneline', 'HEAD...HEAD~1'], wt.worktreePath);
      hasChanges = status.length > 0 || log.length > 0;
    } catch {
      hasChanges = true; // Err on the safe side
    }

    activeWorktree = null;

    if (!shouldKeep && !hasChanges) {
      // Clean up worktree
      try {
        runGit(['worktree', 'remove', wt.worktreePath], context.projectDir);
        runGit(['branch', '-d', wt.branchName], context.projectDir);
      } catch {
        // Best effort cleanup
      }

      return JSON.stringify({
        status: 'worktree_removed',
        name: wt.name,
        message: `Worktree "${wt.name}" removed (no changes detected).`,
      });
    }

    return JSON.stringify({
      status: 'worktree_kept',
      name: wt.name,
      path: wt.worktreePath,
      branch: wt.branchName,
      hasChanges,
      message: `Worktree "${wt.name}" kept at ${wt.worktreePath}.`,
    });
  },
});
