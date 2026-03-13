/**
 * Design System Components - Main Export File
 *
 * Centralized exports for all skeuomorphic design system components
 */

// Core Components
export * from './Button';
export * from './Input';
export * from './Card';
export * from './Modal';

// Types
export * from './types';

// Constants
export const DESIGN_SYSTEM_VERSION = '1.0.0';

export const COMPONENT_ROLES = {
  PRIMARY_ACTION: 'primary-action',    // 10% usage - Wood materials
  SECONDARY_ACTION: 'secondary-action', // 25% usage - Metal materials
  CONTENT: 'content',                  // 60% usage - Paper materials
  OVERLAY: 'overlay',                  // 4% usage - Glass materials
  BACKGROUND: 'background'             // 1% usage - Fabric materials
} as const;

export const MATERIAL_TYPES = {
  PAPER: 'paper',
  METAL: 'metal',
  WOOD: 'wood',
  GLASS: 'glass',
  FABRIC: 'fabric'
} as const;