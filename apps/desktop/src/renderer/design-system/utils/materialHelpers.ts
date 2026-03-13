/**
 * Material System Utility Functions
 *
 * Helper functions for calculating materials, elevations, and managing
 * the skeuomorphic design system programmatically.
 */

import type {
  MaterialType,
  ComponentRole,
  ComponentType,
  InteractionState,
  ElevationLevel,
  MaterialComponentProps,
  PerformanceBudgets
} from './types';

// ========================================
// Material Selection Logic
// ========================================

/**
 * Material hierarchy mapping - defines which materials are used for which roles
 * This enforces the 60/25/10/4/1 usage distribution across the application
 */
export const MATERIAL_HIERARCHY: Record<ComponentRole, MaterialType> = {
  'primary-action': 'wood',    // 10% usage - CTAs, important buttons
  'secondary-action': 'metal', // 25% usage - Navigation, controls
  'content': 'paper',          // 60% usage - Content, forms, cards
  'overlay': 'glass',          // 4% usage - Modals, tooltips
  'background': 'fabric'       // 1% usage - Page backgrounds
};

/**
 * Get the appropriate material for a component role
 * This is the primary function for determining material usage
 */
export function getMaterialForRole(role: ComponentRole): MaterialType {
  return MATERIAL_HIERARCHY[role];
}

/**
 * Get material based on component variant (fallback approach)
 */
export function getMaterialForVariant(variant: string): MaterialType {
  const variantMaterialMap: Record<string, MaterialType> = {
    // Button variants
    'primary': 'wood',
    'secondary': 'metal',
    'tertiary': 'paper',
    'destructive': 'wood', // Error-themed wood
    'ghost': 'glass',

    // Card variants
    'content': 'paper',
    'interactive': 'paper',
    'elevated': 'paper',
    'floating': 'paper',

    // Navigation variants
    'navigation': 'metal',
    'tab': 'metal',
    'breadcrumb': 'paper',

    // Overlay variants
    'modal': 'glass',
    'tooltip': 'glass',
    'popover': 'glass',
    'dropdown': 'glass',

    // Background variants
    'page': 'fabric',
    'section': 'fabric'
  };

  return variantMaterialMap[variant] || 'paper'; // Fallback to paper
}

// ========================================
// Elevation Calculation Logic
// ========================================

/**
 * Base elevation levels for different component types
 */
export const BASE_ELEVATIONS: Record<ComponentType, ElevationLevel> = {
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

/**
 * Interaction state modifiers for elevation
 */
export const ELEVATION_STATE_MODIFIERS: Record<InteractionState, number> = {
  'idle': 0,
  'hover': +1,     // Lift up on hover
  'active': -1,    // Press down on active
  'focus': 0,      // Maintain elevation, add focus ring
  'disabled': -999 // Flatten disabled elements (min 0)
};

/**
 * Get the appropriate elevation for a component type and state
 */
export function getElevationForComponent(
  component: ComponentType,
  state: InteractionState = 'idle'
): ElevationLevel {
  const baseElevation = BASE_ELEVATIONS[component];
  const stateModifier = ELEVATION_STATE_MODIFIERS[state];

  // Calculate new elevation with bounds checking
  const newElevation = baseElevation + stateModifier;

  // Clamp between 0 and 12 (valid elevation range)
  return Math.max(0, Math.min(12, newElevation)) as ElevationLevel;
}

/**
 * Get material-specific elevation mapping
 */
export function getElevationForMaterial(
  material: MaterialType,
  usage: 'flat' | 'raised' | 'floating' | 'modal' = 'raised'
): ElevationLevel {
  const materialElevations = {
    paper: { flat: 0, raised: 1, floating: 3, modal: 7 },
    metal: { flat: 1, raised: 2, floating: 4, modal: 8 },
    wood: { flat: 2, raised: 3, floating: 5, modal: 9 },
    glass: { flat: 6, raised: 7, floating: 9, modal: 11 },
    fabric: { flat: 0, raised: 0, floating: 1, modal: 2 }
  } as const;

  return materialElevations[material][usage];
}

// ========================================
// CSS Class Generation
// ========================================

/**
 * Generate CSS classes for a material component
 */
export function getMaterialClasses(
  material: MaterialType,
  variant?: string,
  elevation?: ElevationLevel,
  interactive: boolean = false,
  disabled: boolean = false
): string {
  const classes: string[] = [];

  // Base material class
  classes.push(`material-${material}-base`);

  // Variant-specific class if provided
  if (variant) {
    classes.push(`material-${material}-${variant}`);
  }

  // Elevation class
  if (elevation !== undefined) {
    classes.push(`elevation-${elevation}`);
  }

  // Interactive behavior class
  if (interactive && !disabled) {
    classes.push('interactive-base', `interactive-${material}`);
  }

  // Disabled state
  if (disabled) {
    classes.push('disabled-state');
  }

  return classes.join(' ');
}

/**
 * Generate interaction state classes
 */
export function getInteractionClasses(
  material: MaterialType,
  interactive: boolean = false,
  disabled: boolean = false
): string {
  if (!interactive || disabled) {
    return '';
  }

  return `interactive-base interactive-${material}`;
}

// ========================================
// Responsive & Performance Utilities
// ========================================

/**
 * Check if materials should be simplified (e.g., mobile devices)
 */
export function shouldSimplifyMaterials(): boolean {
  // Check viewport width
  if (typeof window !== 'undefined') {
    return window.innerWidth < 768; // Mobile breakpoint
  }
  return false;
}

/**
 * Check if user prefers reduced motion
 */
export function shouldReduceMotion(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

/**
 * Check if high contrast mode is enabled
 */
export function isHighContrastMode(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-contrast: high)').matches;
  }
  return false;
}

/**
 * Get appropriate animation duration based on material and user preferences
 */
export function getAnimationDuration(
  material: MaterialType,
  defaultDuration: number = 200
): number {
  if (shouldReduceMotion()) {
    return Math.min(defaultDuration, 100); // Faster for reduced motion
  }

  // Material-specific duration multipliers
  const materialDurations = {
    paper: 1.0,    // Standard duration
    metal: 0.5,    // Faster, crisp interactions
    wood: 1.5,     // Slower, organic feel
    glass: 1.0,    // Standard, floating
    fabric: 1.2    // Slightly slower, soft
  };

  return Math.round(defaultDuration * materialDurations[material]);
}

// ========================================
// Theme Integration Utilities
// ========================================

/**
 * Get theme-aware CSS custom property name
 */
export function getThemeAwareProperty(
  material: MaterialType,
  property: 'base' | 'highlight' | 'shadow',
  theme?: string
): string {
  const baseProperty = `--material-${material}-${property}`;

  // Return theme-specific property if theme is provided
  if (theme && theme !== 'default') {
    return `--theme-${theme}-${material}-${property}`;
  }

  return baseProperty;
}

/**
 * Generate CSS custom properties object for a material
 */
export function getMaterialCSSProperties(
  material: MaterialType,
  theme?: string
): Record<string, string> {
  return {
    '--current-material': material,
    '--current-material-base': getThemeAwareProperty(material, 'base', theme),
    '--current-material-highlight': getThemeAwareProperty(material, 'highlight', theme),
    '--current-material-shadow': getThemeAwareProperty(material, 'shadow', theme)
  };
}

// ========================================
// Performance Validation Utilities
// ========================================

/**
 * Performance budgets for material complexity
 */
export const PERFORMANCE_BUDGETS: PerformanceBudgets = {
  maxGradients: 3,
  maxShadows: 3,
  maxAnimationDuration: 750, // ms
  allowedAnimationProperties: ['transform', 'opacity', 'filter'],
  forbiddenProperties: ['width', 'height', 'top', 'left', 'right', 'bottom']
};

/**
 * Validate if element exceeds performance budgets
 */
export function validatePerformance(element: HTMLElement): string[] {
  const issues: string[] = [];
  const computedStyle = window.getComputedStyle(element);

  // Check gradient complexity
  const background = computedStyle.background;
  const gradientCount = (background.match(/gradient/g) || []).length;
  if (gradientCount > PERFORMANCE_BUDGETS.maxGradients) {
    issues.push(`Too many gradients: ${gradientCount} (max ${PERFORMANCE_BUDGETS.maxGradients})`);
  }

  // Check shadow complexity
  const boxShadow = computedStyle.boxShadow;
  const shadowCount = boxShadow === 'none' ? 0 : boxShadow.split(',').length;
  if (shadowCount > PERFORMANCE_BUDGETS.maxShadows) {
    issues.push(`Too many shadows: ${shadowCount} (max ${PERFORMANCE_BUDGETS.maxShadows})`);
  }

  return issues;
}

// ========================================
// Material Component Props Utilities
// ========================================

/**
 * Extract and validate material props from component props
 */
export function extractMaterialProps(props: MaterialComponentProps) {
  const {
    material,
    variant,
    elevation,
    texture = true,
    interactive = false,
    disabled = false,
    size = 'md',
    theme,
    className = '',
    ...restProps
  } = props;

  // Determine material if not explicitly provided
  const resolvedMaterial = material || (variant ? getMaterialForVariant(variant) : 'paper');

  // Calculate elevation if not explicitly provided
  const resolvedElevation = elevation ?? 1; // Default elevation

  return {
    materialProps: {
      material: resolvedMaterial,
      variant,
      elevation: resolvedElevation,
      texture: texture && !shouldSimplifyMaterials(),
      interactive,
      disabled,
      size,
      theme
    },
    className: [
      getMaterialClasses(resolvedMaterial, variant, resolvedElevation, interactive, disabled),
      className
    ].filter(Boolean).join(' '),
    restProps
  };
}

/**
 * Generate data attributes for debugging and testing
 */
export function getMaterialDataAttributes(
  material: MaterialType,
  elevation: ElevationLevel,
  interactive: boolean
): Record<string, string> {
  return {
    'data-material': material,
    'data-elevation': elevation.toString(),
    'data-interactive': interactive.toString(),
    'data-design-system': 'skeuomorphic'
  };
}

// ========================================
// Validation & Error Handling
// ========================================

/**
 * Validate material type
 */
export function isValidMaterial(material: string): material is MaterialType {
  return ['paper', 'metal', 'wood', 'glass', 'fabric'].includes(material);
}

/**
 * Validate elevation level
 */
export function isValidElevation(elevation: number): elevation is ElevationLevel {
  return Number.isInteger(elevation) && elevation >= 0 && elevation <= 12;
}

/**
 * Validate component role
 */
export function isValidComponentRole(role: string): role is ComponentRole {
  return Object.keys(MATERIAL_HIERARCHY).includes(role);
}

// ========================================
// Development & Debug Utilities
// ========================================

/**
 * Get material usage statistics for debugging
 */
export function getMaterialUsageStats(): Record<MaterialType, { count: number; percentage: number }> {
  if (typeof document === 'undefined') return {} as any;

  const elements = document.querySelectorAll('[data-material]');
  const usage: Record<MaterialType, number> = {
    paper: 0, metal: 0, wood: 0, glass: 0, fabric: 0
  };

  elements.forEach(el => {
    const material = el.getAttribute('data-material') as MaterialType;
    if (isValidMaterial(material)) {
      usage[material]++;
    }
  });

  const total = Object.values(usage).reduce((sum, count) => sum + count, 0);

  return Object.entries(usage).reduce((stats, [material, count]) => {
    stats[material as MaterialType] = {
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    };
    return stats;
  }, {} as any);
}

/**
 * Log material hierarchy compliance
 */
export function logMaterialCompliance(): void {
  if (typeof console === 'undefined') return;

  const stats = getMaterialUsageStats();
  const targetPercentages = { paper: 60, metal: 25, wood: 10, glass: 4, fabric: 1 };

  console.group('📊 Material System Compliance');

  Object.entries(stats).forEach(([material, { count, percentage }]) => {
    const target = targetPercentages[material as MaterialType];
    const compliance = Math.abs(percentage - target) <= 5 ? '✅' : '⚠️';

    console.log(
      `${compliance} ${material}: ${percentage}% (target: ${target}%, count: ${count})`
    );
  });

  console.groupEnd();
}

// Export all utilities
export default {
  getMaterialForRole,
  getMaterialForVariant,
  getElevationForComponent,
  getElevationForMaterial,
  getMaterialClasses,
  getInteractionClasses,
  shouldSimplifyMaterials,
  shouldReduceMotion,
  isHighContrastMode,
  getAnimationDuration,
  getThemeAwareProperty,
  getMaterialCSSProperties,
  validatePerformance,
  extractMaterialProps,
  getMaterialDataAttributes,
  isValidMaterial,
  isValidElevation,
  isValidComponentRole,
  getMaterialUsageStats,
  logMaterialCompliance
};