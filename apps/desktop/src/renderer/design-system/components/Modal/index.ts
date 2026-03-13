/**
 * Modal Component Exports
 *
 * Centralized exports for the Modal component system
 * with material design system integration.
 */

// Material Design System Modal (New)
export { MaterialModal, MaterialModal as Modal } from './MaterialModal';

// Re-export types
export type { ModalProps } from '../types';

// Export variant constants for external use
export const MODAL_SIZES = {
  XS: 'xs',
  SM: 'sm',
  MD: 'md',
  LG: 'lg',
  XL: 'xl',
  FULL: 'full'
} as const;