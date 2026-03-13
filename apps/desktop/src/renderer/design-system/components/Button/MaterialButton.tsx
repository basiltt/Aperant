/**
 * Material Button Component
 *
 * Skeuomorphic button implementation with wood, metal, and paper materials
 * following the material hierarchy and interaction patterns specification.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useMaterialComponent, useAnimationDuration } from '../hooks';
import type { ButtonProps } from '../types';

// Material mapping based on button hierarchy
const BUTTON_MATERIAL_MAPPING = {
  primary: 'wood',      // Wood for primary actions (10% usage)
  secondary: 'metal',   // Metal for secondary actions (25% usage)
  tertiary: 'paper',    // Paper for tertiary actions (60% usage)
  destructive: 'wood',  // Error-themed wood
  ghost: 'glass'        // Glass for subtle actions
} as const;

const MaterialButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(({
  variant = 'tertiary',
  size = 'md',
  pill = false,
  loading = false,
  disabled = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  children,
  className,
  onClick,
  ...props
}, ref) => {
  // Get material based on variant
  const material = BUTTON_MATERIAL_MAPPING[variant];

  // Use material component hook for consistent behavior
  const { componentProps, materialInfo } = useMaterialComponent({
    material,
    variant,
    interactive: !disabled && !loading,
    disabled: disabled || loading,
    size,
    className
  });

  // Get material-aware animation duration
  const { duration } = useAnimationDuration(material);

  // Handle click events
  const handleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    onClick?.(event);
  }, [disabled, loading, onClick]);

  // Size-based styling
  const sizeClasses = React.useMemo(() => {
    const sizes = {
      xs: 'text-xs px-2.5 py-1.5 min-h-[28px]',
      sm: 'text-sm px-3 py-2 min-h-[32px]',
      md: 'text-base px-4 py-2.5 min-h-[36px]',
      lg: 'text-lg px-5 py-3 min-h-[40px]',
      xl: 'text-xl px-6 py-3.5 min-h-[44px]'
    };
    return sizes[size];
  }, [size]);

  // Variant-specific styling
  const variantClasses = React.useMemo(() => {
    const variants = {
      primary: [
        // Wood material with rich grain texture
        'bg-gradient-to-b from-amber-600 via-amber-700 to-amber-800',
        'border-2 border-amber-900',
        'text-white font-semibold',
        'shadow-lg shadow-amber-900/30',
        // Wood-specific interactions
        'hover:from-amber-500 hover:via-amber-600 hover:to-amber-700',
        'hover:shadow-xl hover:shadow-amber-900/40',
        'active:from-amber-800 active:via-amber-900 active:to-amber-900',
        'active:shadow-inner active:shadow-amber-950/50',
        // Focus ring
        'focus-visible:ring-4 focus-visible:ring-amber-500/40',
        // Text shadow for wood
        'text-shadow-sm'
      ].join(' '),

      secondary: [
        // Metal material with brushed texture
        'bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400',
        'border-2 border-slate-500',
        'text-slate-800 font-medium',
        'shadow-md shadow-slate-400/30',
        // Metal-specific interactions
        'hover:from-slate-100 hover:via-slate-200 hover:to-slate-300',
        'hover:shadow-lg hover:shadow-slate-400/40',
        'hover:border-slate-400',
        'active:from-slate-400 active:via-slate-500 active:to-slate-600',
        'active:shadow-inner active:shadow-slate-700/30',
        'active:text-slate-900',
        // Focus ring
        'focus-visible:ring-4 focus-visible:ring-slate-400/40',
        // Subtle text shadow for metal
        'text-shadow-xs'
      ].join(' '),

      tertiary: [
        // Paper material with fiber texture
        'bg-gradient-to-b from-stone-50 via-stone-100 to-stone-150',
        'border border-stone-300',
        'text-stone-700 font-normal',
        'shadow-sm shadow-stone-300/20',
        // Paper-specific interactions
        'hover:from-stone-25 hover:via-stone-75 hover:to-stone-125',
        'hover:shadow-md hover:shadow-stone-300/30',
        'hover:border-stone-400',
        'active:from-stone-100 active:via-stone-150 active:to-stone-200',
        'active:shadow-inner active:shadow-stone-400/20',
        // Focus ring
        'focus-visible:ring-4 focus-visible:ring-amber-600/30'
      ].join(' '),

      destructive: [
        // Error-themed wood
        'bg-gradient-to-b from-red-600 via-red-700 to-red-800',
        'border-2 border-red-900',
        'text-white font-semibold',
        'shadow-lg shadow-red-900/30',
        // Destructive interactions
        'hover:from-red-500 hover:via-red-600 hover:to-red-700',
        'hover:shadow-xl hover:shadow-red-900/40',
        'active:from-red-800 active:via-red-900 active:to-red-950',
        'active:shadow-inner active:shadow-red-950/50',
        // Focus ring
        'focus-visible:ring-4 focus-visible:ring-red-500/40',
        'text-shadow-sm'
      ].join(' '),

      ghost: [
        // Glass material - subtle and transparent
        'bg-white/10 backdrop-blur-md',
        'border border-white/20',
        'text-stone-700 font-normal',
        'shadow-sm shadow-black/5',
        // Glass interactions
        'hover:bg-white/20 hover:backdrop-blur-lg',
        'hover:border-white/30',
        'hover:shadow-md hover:shadow-black/10',
        'active:bg-white/5 active:backdrop-blur-sm',
        // Focus ring
        'focus-visible:ring-4 focus-visible:ring-amber-600/20'
      ].join(' ')
    };
    return variants[variant];
  }, [variant]);

  // Disabled styling
  const disabledClasses = React.useMemo(() => {
    if (!disabled && !loading) return '';

    return [
      'opacity-50 cursor-not-allowed',
      'shadow-none', // Remove all shadows when disabled
      'transform-none', // Disable transforms
      'hover:shadow-none hover:transform-none', // Disable hover effects
      'active:shadow-none active:transform-none' // Disable active effects
    ].join(' ');
  }, [disabled, loading]);

  // Loading styling
  const loadingClasses = React.useMemo(() => {
    if (!loading) return '';
    return 'cursor-wait';
  }, [loading]);

  // Pill styling
  const pillClasses = React.useMemo(() => {
    if (!pill) return '';
    return 'rounded-full';
  }, [pill]);

  // Combine all classes
  const finalClassName = cn(
    // Base button styling
    'inline-flex items-center justify-center gap-2',
    'font-medium tracking-wide',
    'border-0 rounded-lg',
    'transition-all duration-200 ease-out',
    'select-none outline-none',
    // Material and design system classes
    componentProps.className,
    // Size classes
    sizeClasses,
    // Variant classes
    variantClasses,
    // State classes
    disabledClasses,
    loadingClasses,
    // Shape classes
    pillClasses,
    // Custom classes
    className
  );

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      onClick={handleClick}
      {...componentProps}
      {...props}
      className={finalClassName}
      style={{
        ...componentProps.style,
        transitionDuration: `${duration}ms`,
        ...props.style
      }}
    >
      {/* Loading spinner */}
      {loading && (
        <div
          className="animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ width: '1em', height: '1em' }}
          aria-hidden="true"
        />
      )}

      {/* Left icon */}
      {LeftIcon && !loading && (
        <LeftIcon className="w-4 h-4 shrink-0" />
      )}

      {/* Button content */}
      {children && (
        <span className="truncate">
          {children}
        </span>
      )}

      {/* Right icon */}
      {RightIcon && !loading && (
        <RightIcon className="w-4 h-4 shrink-0" />
      )}
    </button>
  );
});

MaterialButton.displayName = 'MaterialButton';

export { MaterialButton };
export default MaterialButton;