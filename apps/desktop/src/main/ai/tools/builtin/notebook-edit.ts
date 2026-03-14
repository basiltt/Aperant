/**
 * NotebookEdit Tool
 * =================
 *
 * Modifies Jupyter notebook (.ipynb) cells.
 * Supports replacing cell content, inserting new cells, and deleting cells.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod/v3';

import { assertPathContained } from '../../security/path-containment';
import { Tool } from '../define';
import { DEFAULT_EXECUTION_OPTIONS, ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  notebook_path: z
    .string()
    .describe('The absolute path to the Jupyter notebook file to edit'),
  cell_id: z
    .string()
    .optional()
    .describe(
      'The ID of the cell to edit. When inserting, the new cell is inserted after this cell.',
    ),
  cell_number: z
    .number()
    .optional()
    .describe('The 0-indexed cell number to edit (alternative to cell_id).'),
  new_source: z.string().describe('The new source content for the cell'),
  cell_type: z
    .enum(['code', 'markdown'])
    .optional()
    .describe(
      'The type of the cell (code or markdown). Defaults to current cell type. Required for insert mode.',
    ),
  edit_mode: z
    .enum(['replace', 'insert', 'delete'])
    .optional()
    .describe('The type of edit to make. Defaults to replace.'),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotebookCell {
  id?: string;
  cell_type: string;
  source: string | string[];
  metadata?: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
}

interface Notebook {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const notebookEditTool = Tool.define({
  metadata: {
    name: 'NotebookEdit',
    description:
      'Modifies Jupyter notebook (.ipynb) cells. Supports replacing cell content, inserting new cells, and deleting cells. The notebook_path must be an absolute path.',
    permission: ToolPermission.RequiresApproval,
    executionOptions: DEFAULT_EXECUTION_OPTIONS,
  },
  inputSchema,
  execute: async (input, context) => {
    const notebookPath = input.notebook_path;

    // Security: ensure path is within project boundary
    assertPathContained(notebookPath, context.projectDir);

    if (!fs.existsSync(notebookPath)) {
      return `Error: Notebook not found: ${notebookPath}`;
    }

    const ext = path.extname(notebookPath).toLowerCase();
    if (ext !== '.ipynb') {
      return `Error: Not a Jupyter notebook file: ${notebookPath}`;
    }

    // Read and parse notebook
    const rawContent = fs.readFileSync(notebookPath, 'utf-8');
    let notebook: Notebook;
    try {
      notebook = JSON.parse(rawContent) as Notebook;
    } catch {
      return `Error: Failed to parse notebook JSON: ${notebookPath}`;
    }

    if (!Array.isArray(notebook.cells)) {
      return `Error: Invalid notebook format — no cells array found.`;
    }

    // Determine cell index
    let cellIndex: number;
    if (input.cell_id !== undefined) {
      cellIndex = notebook.cells.findIndex((c) => c.id === input.cell_id);
      if (cellIndex === -1) {
        return `Error: Cell with ID "${input.cell_id}" not found in notebook.`;
      }
    } else if (input.cell_number !== undefined) {
      cellIndex = input.cell_number;
    } else {
      return `Error: Either cell_id or cell_number must be provided.`;
    }

    const mode = input.edit_mode ?? 'replace';

    // Ensure the source is stored as an array of lines (notebook convention)
    const sourceLines = input.new_source.split('\n').map((line, i, arr) =>
      i < arr.length - 1 ? line + '\n' : line,
    );

    switch (mode) {
      case 'replace': {
        if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
          return `Error: Cell index ${cellIndex} out of range (0-${notebook.cells.length - 1}).`;
        }
        const cell = notebook.cells[cellIndex];
        cell.source = sourceLines;
        if (input.cell_type) {
          cell.cell_type = input.cell_type;
        }
        break;
      }
      case 'insert': {
        if (!input.cell_type) {
          return `Error: cell_type is required for insert mode.`;
        }
        const newCell: NotebookCell = {
          cell_type: input.cell_type,
          source: sourceLines,
          metadata: {},
        };
        if (input.cell_type === 'code') {
          newCell.outputs = [];
          newCell.execution_count = null;
        }
        // Insert after the specified cell (or at beginning if -1/0)
        const insertIdx = Math.max(0, Math.min(cellIndex + 1, notebook.cells.length));
        notebook.cells.splice(insertIdx, 0, newCell);
        break;
      }
      case 'delete': {
        if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
          return `Error: Cell index ${cellIndex} out of range (0-${notebook.cells.length - 1}).`;
        }
        notebook.cells.splice(cellIndex, 1);
        break;
      }
      default:
        return `Error: Unknown edit_mode "${mode}".`;
    }

    // Write back
    fs.writeFileSync(notebookPath, JSON.stringify(notebook, null, 1), 'utf-8');

    return `Successfully ${mode === 'replace' ? 'replaced' : mode === 'insert' ? 'inserted' : 'deleted'} cell in ${path.basename(notebookPath)}.`;
  },
});
