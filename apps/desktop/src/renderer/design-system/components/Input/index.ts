/**
 * Input Component Exports
 *
 * Centralized exports for the Input component system
 * with material design system integration.
 */

// Material Design System Input (New)
export { MaterialInput, MaterialInput as Input } from './MaterialInput';

// Re-export types
export type { InputProps } from '../types';

// Export variant constants for external use
export const INPUT_TYPES = {
  TEXT: 'text',
  EMAIL: 'email',
  PASSWORD: 'password',
  NUMBER: 'number',
  SEARCH: 'search',
  URL: 'url',
  TEL: 'tel'
} as const;

export const INPUT_SIZES = {
  SM: 'sm',
  MD: 'md',
  LG: 'lg'
} as const;