/**
 * Material Input Component
 *
 * Metal frame + Paper content input pattern following the
 * skeuomorphic design system specifications.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useMaterialComponent, useAnimationDuration } from '../hooks';
import type { InputProps } from '../types';

const MaterialInput = React.forwardRef<
  HTMLInputElement,
  InputProps
>(({
  type = 'text',
  size = 'md',
  label,
  helperText,
  error,
  required = false,
  readonly = false,
  disabled = false,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className,
  value,
  onChange,
  ...props
}, ref) => {
  // Use metal material for the outer frame
  const { componentProps } = useMaterialComponent({
    material: 'metal',
    variant: 'frame',
    interactive: !disabled && !readonly,
    disabled,
    size,
    className
  });

  // Get material-aware animation duration
  const { duration } = useAnimationDuration('metal');

  // Handle change events
  const handleChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || readonly) return;
    onChange?.(event.target.value);
  }, [disabled, readonly, onChange]);

  // Size-based styling
  const sizeClasses = React.useMemo(() => {
    const sizes = {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg'
    };
    return sizes[size];
  }, [size]);

  // Container classes for metal frame
  const frameClasses = cn(
    // Metal frame base styling
    'relative flex items-center',
    'bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400',
    'border-2 border-slate-500',
    'rounded-md',
    'shadow-md shadow-slate-400/30',
    'p-0.5', // Small padding for the frame
    // Focus state - warm wood glow
    'focus-within:border-amber-600',
    'focus-within:shadow-lg focus-within:shadow-amber-600/30',
    // Error state
    error && 'border-red-600 shadow-red-600/30',
    // Disabled state
    disabled && 'opacity-50 cursor-not-allowed',
    // Transition
    'transition-all duration-200 ease-out'
  );

  // Paper content classes
  const inputClasses = cn(
    // Paper content base styling
    'flex-1 w-full',
    'bg-gradient-to-b from-stone-50 via-stone-100 to-stone-150',
    'border border-transparent rounded-sm',
    'text-stone-700',
    'placeholder:text-stone-400',
    'outline-none',
    // Size-specific padding
    size === 'sm' && 'px-3 py-2 min-h-[32px]',
    size === 'md' && 'px-4 py-2.5 min-h-[36px]',
    size === 'lg' && 'px-5 py-3 min-h-[40px]',
    // Font size
    sizeClasses,
    // States
    'focus:bg-gradient-to-b focus:from-stone-25 focus:via-stone-75 focus:to-stone-125',
    'focus:border-amber-600/50',
    disabled && 'cursor-not-allowed',
    readonly && 'cursor-default',
    // Custom classes
    className
  );

  // Label classes
  const labelClasses = cn(
    'block text-sm font-medium',
    'text-stone-700 mb-2',
    required && 'after:content-["*"] after:ml-1 after:text-red-500',
    disabled && 'text-stone-400'
  );

  // Helper text classes
  const helperClasses = cn(
    'mt-2 text-sm',
    error ? 'text-red-600' : 'text-stone-600'
  );

  return (
    <div className="w-full">
      {/* Label */}
      {label && (
        <label className={labelClasses}>
          {label}
        </label>
      )}

      {/* Metal frame container */}
      <div className={frameClasses}>
        {/* Left icon */}
        {LeftIcon && (
          <div className="flex items-center justify-center px-3 text-stone-500">
            <LeftIcon className="w-4 h-4" />
          </div>
        )}

        {/* Paper input content */}
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readonly}
          required={required}
          className={inputClasses}
          style={{
            transitionDuration: `${duration}ms`
          }}
          {...props}
        />

        {/* Right icon */}
        {RightIcon && (
          <div className="flex items-center justify-center px-3 text-stone-500">
            <RightIcon className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Helper text or error message */}
      {(helperText || error) && (
        <p className={helperClasses}>
          {error || helperText}
        </p>
      )}
    </div>
  );
});

MaterialInput.displayName = 'MaterialInput';

export { MaterialInput };
export default MaterialInput;