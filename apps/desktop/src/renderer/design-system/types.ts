/**
 * Material Design System TypeScript Definitions
 *
 * TypeScript types and interfaces for the skeuomorphic design system
 * providing type safety and IntelliSense for material components.
 */

// ========================================
// Core Material Types
// ========================================

export type MaterialType = 'paper' | 'metal' | 'wood' | 'glass' | 'fabric';

export type MaterialVariant = {
  paper: 'white' | 'cream' | 'aged';
  metal: 'platinum' | 'steel' | 'titanium';
  wood: 'walnut' | 'mahogany' | 'oak';
  glass: 'clear' | 'tinted' | 'frosted';
  fabric: 'linen' | 'canvas' | 'charcoal';
};

// ========================================
// Elevation System Types
// ========================================

export type ElevationLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface ElevationMapping {
  paper: {
    flat: 0;
    card: 1;
    raised: 2;
    floating: 3;
  };
  metal: {
    control: 2;
    button: 3;
    toolbar: 4;
    panel: 5;
  };
  wood: {
    button: 3;
    accent: 2;
    panel: 4;
    feature: 5;
  };
  glass: {
    overlay: 7;
    modal: 9;
    tooltip: 10;
    system: 11;
  };
  fabric: {
    background: 0;
    texture: 1;
  };
}

// ========================================
// Interaction State Types
// ========================================

export type InteractionState = 'idle' | 'hover' | 'active' | 'focus' | 'disabled';

export interface MaterialInteractionStates {
  idle: MaterialStyle;
  hover: MaterialStyle;
  active: MaterialStyle;
  focus: MaterialStyle;
  disabled: MaterialStyle;
}

export interface MaterialStyle {
  background: string;
  texture?: string;
  elevation: string;
  border?: string;
  transform: string;
  transition: string;
}

// ========================================
// Component Base Types
// ========================================

export interface MaterialComponentProps {
  /**
   * Material type - determines the physical appearance and interaction behavior
   */
  material?: MaterialType;

  /**
   * Material variant - specific variation within the material type
   */
  variant?: string;

  /**
   * Elevation level (0-12) - auto-calculated based on component type if not specified
   */
  elevation?: ElevationLevel;

  /**
   * Enable texture rendering - may be disabled on mobile for performance
   */
  texture?: boolean;

  /**
   * Enable interactive behavior and states
   */
  interactive?: boolean;

  /**
   * Disabled state
   */
  disabled?: boolean;

  /**
   * Size variant
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  /**
   * Theme integration - adapts materials to current theme
   */
  theme?: string;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * React children
   */
  children?: React.ReactNode;
}

// ========================================
// Button Component Types
// ========================================

export interface ButtonProps extends MaterialComponentProps {
  variant: 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'ghost';
  pill?: boolean;
  loading?: boolean;
  leftIcon?: React.ComponentType<{ className?: string }>;
  rightIcon?: React.ComponentType<{ className?: string }>;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  form?: string;
}

// ========================================
// Input Component Types
// ========================================

export interface InputProps extends MaterialComponentProps {
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'url' | 'tel';
  label?: string;
  placeholder?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  readonly?: boolean;
  leftIcon?: React.ComponentType<{ className?: string }>;
  rightIcon?: React.ComponentType<{ className?: string }>;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
}

// ========================================
// Card Component Types
// ========================================

export interface CardProps extends MaterialComponentProps {
  variant: 'flat' | 'raised' | 'floating' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  header?: React.ReactNode;
  footer?: React.ReactNode;
  hoverable?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

// ========================================
// Modal Component Types
// ========================================

export interface ModalProps extends MaterialComponentProps {
  open: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  centered?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
}

// ========================================
// Material Utility Types
// ========================================

export interface MaterialUtilities {
  /**
   * Get the appropriate material for a component role
   */
  getMaterialForRole: (role: ComponentRole) => MaterialType;

  /**
   * Get the appropriate elevation for a component type and state
   */
  getElevationForComponent: (component: ComponentType, state: InteractionState) => ElevationLevel;

  /**
   * Generate material-aware CSS classes
   */
  getMaterialClasses: (material: MaterialType, variant?: string, elevation?: ElevationLevel) => string;

  /**
   * Check if component should use simplified materials (e.g., mobile)
   */
  shouldSimplifyMaterials: () => boolean;
}

// ========================================
// Component Role & Hierarchy Types
// ========================================

export type ComponentRole =
  | 'primary-action'    // 10% usage - CTAs, important buttons (Wood)
  | 'secondary-action'  // 25% usage - Navigation, controls (Metal)
  | 'content'          // 60% usage - Content, forms, cards (Paper)
  | 'overlay'          // 4% usage - Modals, tooltips (Glass)
  | 'background';      // 1% usage - Page backgrounds (Fabric)

export type ComponentType =
  | 'button'
  | 'input'
  | 'card'
  | 'navigation'
  | 'modal'
  | 'tooltip'
  | 'badge'
  | 'progress'
  | 'tab';

// ========================================
// Theme Integration Types
// ========================================

export interface ThemeAwareMaterial {
  /**
   * Base material colors that adapt through CSS custom properties
   */
  base: string;
  highlight: string;
  shadow: string;

  /**
   * Theme-specific adjustments
   */
  themeMultipliers?: {
    warmth: number;
    contrast: number;
    saturation: number;
  };
}

export interface DesignSystemTheme {
  materials: {
    wood: ThemeAwareMaterial;
    metal: ThemeAwareMaterial;
    paper: ThemeAwareMaterial;
    glass: ThemeAwareMaterial;
    fabric: ThemeAwareMaterial;
  };

  /**
   * Theme-specific performance settings
   */
  performance: {
    enableTextures: boolean;
    maxElevation: ElevationLevel;
    simplifyAnimations: boolean;
  };
}

// ========================================
// Performance & Responsive Types
// ========================================

export interface ResponsiveBreakpoints {
  mobile: string;    // max-width: 767px
  tablet: string;    // 768px-1023px
  desktop: string;   // min-width: 1024px
}

export interface PerformanceBudgets {
  maxGradients: number;        // Max 3 per element
  maxShadows: number;         // Max 3 per element
  maxAnimationDuration: number; // 750ms max
  allowedAnimationProperties: string[];
  forbiddenProperties: string[];
}

// ========================================
// Design System Configuration
// ========================================

export interface DesignSystemConfig {
  /**
   * Material usage hierarchy enforcement
   */
  materialHierarchy: Record<ComponentRole, MaterialType>;

  /**
   * Elevation mappings for component types
   */
  elevationMappings: Record<ComponentType, ElevationLevel>;

  /**
   * Performance constraints
   */
  performance: PerformanceBudgets;

  /**
   * Responsive behavior settings
   */
  responsive: {
    breakpoints: ResponsiveBreakpoints;
    degradeOnMobile: boolean;
    touchTargetMinSize: number; // 44px for WCAG
  };

  /**
   * Accessibility settings
   */
  accessibility: {
    respectReducedMotion: boolean;
    enhanceContrastMode: boolean;
    focusRingWidth: number;
    focusRingOffset: number;
  };
}

// ========================================
// Material Calculation Utilities
// ========================================

/**
 * Material selection logic based on component role
 */
export const materialHierarchy: Record<ComponentRole, MaterialType> = {
  'primary-action': 'wood',    // 10% usage
  'secondary-action': 'metal', // 25% usage
  'content': 'paper',          // 60% usage
  'overlay': 'glass',          // 4% usage
  'background': 'fabric'       // 1% usage
};

/**
 * Elevation mappings for different component types
 */
export const elevationMappings: Record<ComponentType, ElevationLevel> = {
  'button': 2,
  'input': 2,
  'card': 1,
  'navigation': 4,
  'modal': 9,
  'tooltip': 10,
  'badge': 1,
  'progress': 2,
  'tab': 2
};

// ========================================
// Hook Types for React Integration
// ========================================

export interface UseMaterialStylesProps {
  material: MaterialType;
  variant?: string;
  elevation?: ElevationLevel;
  interactive?: boolean;
  disabled?: boolean;
  theme?: string;
}

export interface UseMaterialStylesResult {
  materialClasses: string;
  style: React.CSSProperties;
  materialProps: {
    'data-material': MaterialType;
    'data-elevation': ElevationLevel;
    'data-interactive': boolean;
  };
}

export interface UseInteractionStatesProps {
  interactive: boolean;
  disabled: boolean;
  material: MaterialType;
}

export interface UseInteractionStatesResult {
  interactionClasses: string;
  interactionHandlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onMouseDown: () => void;
    onMouseUp: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}

// ========================================
// Validation & Error Types
// ========================================

export interface MaterialValidationError {
  type: 'invalid-material' | 'invalid-elevation' | 'performance-budget-exceeded';
  message: string;
  component?: string;
  material?: MaterialType;
  elevation?: ElevationLevel;
}

export interface DesignSystemValidator {
  validateMaterial: (material: MaterialType, variant?: string) => MaterialValidationError | null;
  validateElevation: (elevation: ElevationLevel) => MaterialValidationError | null;
  validatePerformance: (element: HTMLElement) => MaterialValidationError[];
}

// ========================================
// Build-time Type Generation
// ========================================

/**
 * Generate TypeScript types from CSS custom properties at build time
 */
export interface GeneratedCSSTypes {
  materials: Record<string, string>;
  elevations: Record<string, string>;
  spacing: Record<string, string>;
  typography: Record<string, string>;
  motion: Record<string, string>;
}

// ========================================
// Testing & Development Types
// ========================================

export interface MaterialTestingProps {
  /**
   * Force specific material for testing/debugging
   */
  debugMaterial?: MaterialType;

  /**
   * Force specific elevation for testing/debugging
   */
  debugElevation?: ElevationLevel;

  /**
   * Show material boundaries for development
   */
  showBoundaries?: boolean;

  /**
   * Enable performance warnings
   */
  showPerformanceWarnings?: boolean;
}

// ========================================
// Export all types for external use
// ========================================

export type {
  MaterialType,
  MaterialVariant,
  ElevationLevel,
  InteractionState,
  ComponentRole,
  ComponentType,
  MaterialComponentProps,
  ButtonProps,
  InputProps,
  CardProps,
  ModalProps,
  DesignSystemConfig,
  PerformanceBudgets,
  ResponsiveBreakpoints
};