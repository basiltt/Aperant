/**
 * LSP Tool
 * ========
 *
 * Code intelligence via language servers. Reports type errors, warnings,
 * and supports navigation operations like jump to definitions, find references,
 * get type info, list symbols, find implementations, and trace call hierarchies.
 *
 * Requires a code intelligence plugin and its language server binary.
 */

import { z } from 'zod/v3';

import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  action: z
    .enum([
      'diagnostics',
      'definition',
      'references',
      'type_definition',
      'symbols',
      'implementations',
      'call_hierarchy',
    ])
    .describe('The LSP action to perform'),
  file_path: z.string().describe('The absolute path to the file to analyze'),
  line: z.number().optional().describe('Line number (0-indexed) for position-based actions'),
  character: z.number().optional().describe('Character offset (0-indexed) for position-based actions'),
  symbol: z.string().optional().describe('Symbol name to search for'),
});

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const lspTool = Tool.define({
  metadata: {
    name: 'LSP',
    description:
      'Code intelligence via language servers. Reports type errors and warnings after file edits. Supports navigation: jump to definitions, find references, get type info, list symbols, find implementations, trace call hierarchies. Requires a code intelligence plugin.',
    permission: ToolPermission.ReadOnly,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (input, _context) => {
    // LSP integration is a stub — actual implementation requires connecting
    // to a running language server (e.g., tsserver, pyright, rust-analyzer).
    // This tool definition ensures the model can request LSP actions and the
    // proxy can translate them. The desktop app's LSP integration layer
    // should be connected here when available.

    return JSON.stringify({
      action: input.action,
      file: input.file_path,
      status: 'not_available',
      message: `LSP action "${input.action}" is not yet connected to a language server. Install a code intelligence plugin to enable this feature.`,
    });
  },
});
