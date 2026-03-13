/**
 * Material Modal Component
 *
 * Glass overlay + Paper content modal following the
 * skeuomorphic design system specifications.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useMaterialComponent, useAnimationDuration } from '../hooks';
import type { ModalProps } from '../types';

const MaterialModal = React.forwardRef<
  HTMLDivElement,
  ModalProps
>(({
  open,
  size = 'md',
  centered = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  header,
  footer,
  children,
  className,
  onClose,
  ...props
}, ref) => {
  // Use glass material for the modal container
  const { componentProps } = useMaterialComponent({
    material: 'glass',
    variant: 'modal',
    className
  });

  // Get material-aware animation duration
  const { duration } = useAnimationDuration('glass');

  // Handle backdrop clicks
  const handleBackdropClick = React.useCallback((event: React.MouseEvent) => {
    if (!closeOnBackdrop || !onClose) return;
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [closeOnBackdrop, onClose]);

  // Handle escape key
  React.useEffect(() => {
    if (!open || !closeOnEscape || !onClose) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (!open) return;

    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [open]);

  // Size-based styling
  const sizeClasses = React.useMemo(() => {
    const sizes = {
      xs: 'max-w-xs',
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      full: 'max-w-full mx-4'
    };
    return sizes[size];
  }, [size]);

  // Don't render if not open
  if (!open) return null;

  return (
    <>
      {/* Glass backdrop with blur */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={handleBackdropClick}
        style={{
          animation: `fadeIn ${duration}ms ease-out`
        }}
      >
        {/* Modal positioning container */}
        <div
          className={cn(
            'flex min-h-full items-center justify-center p-4',
            centered ? 'items-center' : 'items-start pt-16'
          )}
        >
          {/* Glass modal container */}
          <div
            ref={ref}
            className={cn(
              // Glass container base styling
              'relative w-full',
              'bg-white/85 backdrop-blur-lg',
              'border-2 border-white/40',
              'rounded-xl',
              'shadow-2xl shadow-black/20',
              'max-h-[90vh] overflow-hidden',
              // Size constraints
              sizeClasses,
              // Custom classes
              className
            )}
            style={{
              animation: `slideInScale ${duration * 1.2}ms ease-out`
            }}
            onClick={(e) => e.stopPropagation()}
            {...componentProps}
            {...props}
          >
            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                className={cn(
                  'absolute right-4 top-4 z-10',
                  'flex h-8 w-8 items-center justify-center',
                  'bg-slate-600 hover:bg-amber-600',
                  'border-2 border-amber-600 hover:border-amber-500',
                  'rounded-full',
                  'text-white',
                  'shadow-md hover:shadow-lg',
                  'transition-all duration-150',
                  'hover:-translate-y-0.5 hover:scale-110',
                  'active:translate-y-0 active:scale-95'
                )}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* Paper content area */}
            <div
              className={cn(
                'bg-gradient-to-b from-stone-50 via-stone-100 to-stone-150',
                'border border-stone-200/30 rounded-lg',
                'margin-2 p-6',
                'max-h-[calc(90vh-16px)] overflow-y-auto'
              )}
            >
              {/* Modal header */}
              {header && (
                <div className="border-b border-stone-200/50 pb-4 mb-6">
                  {header}
                </div>
              )}

              {/* Modal content */}
              <div className="relative">
                {children}
              </div>

              {/* Modal footer */}
              {footer && (
                <div className="border-t border-stone-200/50 pt-4 mt-6">
                  {footer}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CSS Keyframes for animations */}
      <style jsx>{`
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes slideInScale {
          0% {
            opacity: 0;
            transform: translate(-50%, -60%) scale(0.9);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>
    </>
  );
});

MaterialModal.displayName = 'MaterialModal';

export { MaterialModal };
export default MaterialModal;