/**
 * Card Component Exports
 *
 * Centralized exports for the Card component system
 * with material design system integration.
 */

// Material Design System Card (New)
export { MaterialCard, MaterialCard as Card } from './MaterialCard';

// Re-export types
export type { CardProps } from '../types';

// Export variant constants for external use
export const CARD_VARIANTS = {
  FLAT: 'flat',
  RAISED: 'raised',
  FLOATING: 'floating',
  INTERACTIVE: 'interactive'
} as const;

export const CARD_PADDING = {
  NONE: 'none',
  SM: 'sm',
  MD: 'md',
  LG: 'lg',
  XL: 'xl'
} as const;