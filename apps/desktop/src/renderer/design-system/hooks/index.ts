/**
 * React Hooks for Material Design System
 *
 * Custom hooks that provide React integration for the skeuomorphic
 * design system with type safety and performance optimizations.
 */

import { useMemo, useCallback, useEffect, useState } from 'react';
import type {
  MaterialType,
  ElevationLevel,
  InteractionState,
  ComponentType,
  UseMaterialStylesProps,
  UseMaterialStylesResult,
  UseInteractionStatesProps,
  UseInteractionStatesResult,
  MaterialComponentProps
} from '../types';
import materialHelpers from '../utils/materialHelpers';

// ========================================
// Core Material Styles Hook
// ========================================

/**
 * Hook for managing material styles and CSS classes
 * This is the primary hook for applying material design system styles
 */
export function useMaterialStyles({
  material,
  variant,
  elevation,
  interactive = false,
  disabled = false,
  theme
}: UseMaterialStylesProps): UseMaterialStylesResult {
  const materialClasses = useMemo(() => {
    return materialHelpers.getMaterialClasses(
      material,
      variant,
      elevation,
      interactive,
      disabled
    );
  }, [material, variant, elevation, interactive, disabled]);

  const style = useMemo(() => {
    const cssProperties = materialHelpers.getMaterialCSSProperties(material, theme);
    return cssProperties as React.CSSProperties;
  }, [material, theme]);

  const materialProps = useMemo(() => {
    return materialHelpers.getMaterialDataAttributes(
      material,
      elevation || 1,
      interactive
    );
  }, [material, elevation, interactive]);

  return {
    materialClasses,
    style,
    materialProps
  };
}

// ========================================
// Interaction States Hook
// ========================================

/**
 * Hook for managing interaction states and behaviors
 * Provides event handlers and classes for hover, active, focus states
 */
export function useInteractionStates({
  interactive,
  disabled,
  material
}: UseInteractionStatesProps): UseInteractionStatesResult {
  const [currentState, setCurrentState] = useState<InteractionState>('idle');

  const interactionClasses = useMemo(() => {
    if (!interactive || disabled) return '';
    return materialHelpers.getInteractionClasses(material, interactive, disabled);
  }, [interactive, disabled, material]);

  const interactionHandlers = useMemo(() => {
    if (!interactive || disabled) {
      return {
        onMouseEnter: () => {},
        onMouseLeave: () => {},
        onMouseDown: () => {},
        onMouseUp: () => {},
        onFocus: () => {},
        onBlur: () => {}
      };
    }

    return {
      onMouseEnter: () => setCurrentState('hover'),
      onMouseLeave: () => setCurrentState('idle'),
      onMouseDown: () => setCurrentState('active'),
      onMouseUp: () => setCurrentState('hover'),
      onFocus: () => setCurrentState('focus'),
      onBlur: () => setCurrentState('idle')
    };
  }, [interactive, disabled]);

  return {
    interactionClasses,
    interactionHandlers
  };
}

// ========================================
// Elevation Management Hook
// ========================================

/**
 * Hook for dynamic elevation management
 * Automatically calculates elevation based on component type and interaction state
 */
export function useElevation(
  componentType: ComponentType,
  initialState: InteractionState = 'idle'
) {
  const [currentState, setCurrentState] = useState<InteractionState>(initialState);

  const currentElevation = useMemo(() => {
    return materialHelpers.getElevationForComponent(componentType, currentState);
  }, [componentType, currentState]);

  const elevationHandlers = useMemo(() => ({
    onMouseEnter: () => setCurrentState('hover'),
    onMouseLeave: () => setCurrentState('idle'),
    onMouseDown: () => setCurrentState('active'),
    onMouseUp: () => setCurrentState('hover'),
    onFocus: () => setCurrentState('focus'),
    onBlur: () => setCurrentState('idle')
  }), []);

  return {
    elevation: currentElevation,
    state: currentState,
    handlers: elevationHandlers,
    setState: setCurrentState
  };
}

// ========================================
// Responsive Materials Hook
// ========================================

/**
 * Hook for responsive material adaptation
 * Simplifies materials on mobile devices for performance
 */
export function useResponsiveMaterials(baseMaterial: MaterialType) {
  const [shouldSimplify, setShouldSimplify] = useState(false);

  useEffect(() => {
    const checkResponsive = () => {
      setShouldSimplify(materialHelpers.shouldSimplifyMaterials());
    };

    // Initial check
    checkResponsive();

    // Listen for resize events
    window.addEventListener('resize', checkResponsive);
    return () => window.removeEventListener('resize', checkResponsive);
  }, []);

  const adaptedMaterial = useMemo(() => {
    if (shouldSimplify) {
      // Simplify complex materials on mobile
      const simplifications: Partial<Record<MaterialType, MaterialType>> = {
        glass: 'paper',  // Glass -> Paper for performance
        wood: 'paper',   // Wood -> Paper for performance
        // metal and paper remain unchanged
        // fabric remains unchanged
      };
      return simplifications[baseMaterial] || baseMaterial;
    }
    return baseMaterial;
  }, [baseMaterial, shouldSimplify]);

  return {
    material: adaptedMaterial,
    isSimplified: shouldSimplify,
    originalMaterial: baseMaterial
  };
}

// ========================================
// Theme-Aware Materials Hook
// ========================================

/**
 * Hook for theme-aware material adaptation
 * Automatically adapts materials to the current theme
 */
export function useThemeAwareMaterials(material: MaterialType, theme?: string) {
  const cssProperties = useMemo(() => {
    return materialHelpers.getMaterialCSSProperties(material, theme);
  }, [material, theme]);

  const themeProperty = useCallback((property: 'base' | 'highlight' | 'shadow') => {
    return materialHelpers.getThemeAwareProperty(material, property, theme);
  }, [material, theme]);

  return {
    cssProperties,
    getThemeProperty: themeProperty,
    currentTheme: theme
  };
}

// ========================================
// Performance Monitoring Hook
// ========================================

/**
 * Hook for monitoring material performance
 * Validates performance budgets and logs warnings
 */
export function usePerformanceMonitoring(elementRef: React.RefObject<HTMLElement>) {
  const [performanceIssues, setPerformanceIssues] = useState<string[]>([]);

  useEffect(() => {
    if (!elementRef.current) return;

    const validateElement = () => {
      if (elementRef.current) {
        const issues = materialHelpers.validatePerformance(elementRef.current);
        setPerformanceIssues(issues);

        // Log issues in development
        if (process.env.NODE_ENV === 'development' && issues.length > 0) {
          console.warn('Material Performance Issues:', issues);
        }
      }
    };

    // Validate after a short delay to allow styles to apply
    const timeoutId = setTimeout(validateElement, 100);

    return () => clearTimeout(timeoutId);
  }, [elementRef]);

  return {
    performanceIssues,
    hasIssues: performanceIssues.length > 0,
    isPerformant: performanceIssues.length === 0
  };
}

// ========================================
// Material Component Base Hook
// ========================================

/**
 * Primary hook for material components
 * Combines all material system functionality into a single hook
 */
export function useMaterialComponent(props: MaterialComponentProps) {
  const {
    materialProps,
    className,
    restProps
  } = useMemo(() => {
    return materialHelpers.extractMaterialProps(props);
  }, [props]);

  const materialStyles = useMaterialStyles({
    material: materialProps.material,
    variant: materialProps.variant,
    elevation: materialProps.elevation,
    interactive: materialProps.interactive,
    disabled: materialProps.disabled,
    theme: materialProps.theme
  });

  const interactionStates = useInteractionStates({
    interactive: materialProps.interactive || false,
    disabled: materialProps.disabled || false,
    material: materialProps.material
  });

  const responsiveMaterial = useResponsiveMaterials(materialProps.material);

  const combinedClasses = useMemo(() => {
    return [
      materialStyles.materialClasses,
      interactionStates.interactionClasses,
      className
    ].filter(Boolean).join(' ');
  }, [materialStyles.materialClasses, interactionStates.interactionClasses, className]);

  const combinedProps = useMemo(() => {
    return {
      ...restProps,
      ...materialStyles.materialProps,
      ...interactionStates.interactionHandlers,
      className: combinedClasses,
      style: {
        ...materialStyles.style,
        ...restProps.style
      }
    };
  }, [restProps, materialStyles.materialProps, interactionStates.interactionHandlers, combinedClasses, materialStyles.style]);

  return {
    componentProps: combinedProps,
    materialInfo: {
      material: responsiveMaterial.material,
      originalMaterial: responsiveMaterial.originalMaterial,
      isSimplified: responsiveMaterial.isSimplified,
      elevation: materialProps.elevation,
      interactive: materialProps.interactive
    }
  };
}

// ========================================
// Animation Duration Hook
// ========================================

/**
 * Hook for material-aware animation durations
 * Respects user motion preferences and material characteristics
 */
export function useAnimationDuration(
  material: MaterialType,
  baseDuration: number = 200
) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const duration = useMemo(() => {
    return materialHelpers.getAnimationDuration(material, baseDuration);
  }, [material, baseDuration, reducedMotion]);

  return {
    duration,
    reducedMotion,
    cssProperty: `${duration}ms`
  };
}

// ========================================
// Material Usage Analytics Hook (Development)
// ========================================

/**
 * Hook for tracking material usage analytics
 * Only active in development mode
 */
export function useMaterialAnalytics() {
  const [analytics, setAnalytics] = useState<ReturnType<typeof materialHelpers.getMaterialUsageStats> | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const updateAnalytics = () => {
      const stats = materialHelpers.getMaterialUsageStats();
      setAnalytics(stats);
    };

    // Update analytics periodically
    updateAnalytics();
    const interval = setInterval(updateAnalytics, 5000);

    return () => clearInterval(interval);
  }, []);

  const logCompliance = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      materialHelpers.logMaterialCompliance();
    }
  }, []);

  return {
    analytics,
    logCompliance,
    isTracking: process.env.NODE_ENV === 'development'
  };
}

// Export all hooks
export default {
  useMaterialStyles,
  useInteractionStates,
  useElevation,
  useResponsiveMaterials,
  useThemeAwareMaterials,
  usePerformanceMonitoring,
  useMaterialComponent,
  useAnimationDuration,
  useMaterialAnalytics
};