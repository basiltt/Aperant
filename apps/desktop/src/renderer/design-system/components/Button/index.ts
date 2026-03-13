/**
 * Button Component Exports
 *
 * Centralized exports for the Button component system
 * with both legacy and material button variants.
 */

// Material Design System Button (New)
export { MaterialButton, MaterialButton as Button } from './MaterialButton';

// Re-export types
export type { ButtonProps } from '../types';

// Export variant constants for external use
export const BUTTON_VARIANTS = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  TERTIARY: 'tertiary',
  DESTRUCTIVE: 'destructive',
  GHOST: 'ghost'
} as const;

export const BUTTON_SIZES = {
  XS: 'xs',
  SM: 'sm',
  MD: 'md',
  LG: 'lg',
  XL: 'xl'
} as const;