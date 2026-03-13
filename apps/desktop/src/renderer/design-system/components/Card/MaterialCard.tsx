/**
 * Material Card Component
 *
 * Paper-based content containers with elevation variants
 * following the skeuomorphic design system specifications.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useMaterialComponent, useAnimationDuration } from '../hooks';
import type { CardProps } from '../types';

const MaterialCard = React.forwardRef<
  HTMLDivElement,
  CardProps
>(({
  variant = 'raised',
  padding = 'md',
  header,
  footer,
  hoverable = false,
  disabled = false,
  children,
  className,
  onClick,
  ...props
}, ref) => {
  // Use paper material for cards
  const { componentProps } = useMaterialComponent({
    material: 'paper',
    variant: variant,
    interactive: hoverable && !disabled,
    disabled,
    className
  });

  // Get material-aware animation duration
  const { duration } = useAnimationDuration('paper');

  // Handle click events
  const handleClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !onClick) return;
    onClick(event);
  }, [disabled, onClick]);

  // Variant-based styling
  const variantClasses = React.useMemo(() => {
    const variants = {
      flat: [
        // Flat paper card
        'bg-gradient-to-b from-stone-50 via-stone-100 to-stone-150',
        'border border-stone-300/20',
        'shadow-none'
      ].join(' '),

      raised: [
        // Standard raised paper card
        'bg-gradient-to-b from-stone-50 via-stone-100 to-stone-150',
        'border border-stone-300/20',
        'shadow-sm shadow-stone-300/20'
      ].join(' '),

      floating: [
        // Floating paper card with more elevation
        'bg-gradient-to-b from-stone-25 via-stone-75 to-stone-125',
        'border border-stone-200/30',
        'shadow-md shadow-stone-300/30'
      ].join(' '),

      interactive: [
        // Interactive paper card with hover states
        'bg-gradient-to-b from-stone-50 via-stone-100 to-stone-150',
        'border border-stone-300/20',
        'shadow-sm shadow-stone-300/20',
        'cursor-pointer'
      ].join(' ')
    };
    return variants[variant];
  }, [variant]);

  // Hover effect for interactive cards
  const hoverClasses = React.useMemo(() => {
    if (!hoverable || disabled) return '';

    return [
      'hover:bg-gradient-to-b hover:from-stone-25 hover:via-stone-75 hover:to-stone-125',
      'hover:shadow-lg hover:shadow-stone-300/40',
      'hover:-translate-y-1 hover:rotate-[0.5deg]',
      'active:shadow-md active:shadow-stone-300/30',
      'active:translate-y-0 active:scale-[0.99]'
    ].join(' ');
  }, [hoverable, disabled]);

  // Padding classes
  const paddingClasses = React.useMemo(() => {
    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4 sm:p-6',
      lg: 'p-6 sm:p-8',
      xl: 'p-8 sm:p-10'
    };
    return paddings[padding];
  }, [padding]);

  // Disabled styling
  const disabledClasses = React.useMemo(() => {
    if (!disabled) return '';
    return 'opacity-50 cursor-not-allowed pointer-events-none';
  }, [disabled]);

  // Combine all classes
  const cardClasses = cn(
    // Base card styling
    'rounded-lg',
    'transition-all ease-out',
    // Material and variant classes
    variantClasses,
    // Interactive behavior
    hoverClasses,
    // Padding
    paddingClasses,
    // State classes
    disabledClasses,
    // Custom classes
    className
  );

  // Header classes
  const headerClasses = cn(
    'border-b border-stone-200/50',
    paddingClasses,
    // Negative margin to account for card padding
    padding !== 'none' && '-mx-4 -mt-4 mb-4 sm:-mx-6 sm:-mt-6 sm:mb-6'
  );

  // Footer classes
  const footerClasses = cn(
    'border-t border-stone-200/50',
    paddingClasses,
    // Negative margin to account for card padding
    padding !== 'none' && '-mx-4 -mb-4 mt-4 sm:-mx-6 sm:-mb-6 sm:mt-6'
  );

  return (
    <div
      ref={ref}
      onClick={handleClick}
      className={cardClasses}
      style={{
        transitionDuration: `${duration}ms`
      }}
      {...componentProps}
      {...props}
    >
      {/* Card header */}
      {header && (
        <div className={headerClasses}>
          {header}
        </div>
      )}

      {/* Card content */}
      <div className="relative">
        {children}
      </div>

      {/* Card footer */}
      {footer && (
        <div className={footerClasses}>
          {footer}
        </div>
      )}
    </div>
  );
});

MaterialCard.displayName = 'MaterialCard';

export { MaterialCard };
export default MaterialCard;