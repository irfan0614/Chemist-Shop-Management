import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm hover:shadow-emerald-900/10 focus-visible:ring-emerald-500',
  secondary:
    'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 focus-visible:ring-slate-400',
  outline:
    'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-200/90 shadow-sm focus-visible:ring-emerald-500',
  danger:
    'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-sm hover:shadow-rose-900/10 focus-visible:ring-rose-500',
  'danger-outline':
    'bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200/80 focus-visible:ring-rose-500',
  warning:
    'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm hover:shadow-amber-900/10 focus-visible:ring-amber-500',
  indigo:
    'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-sm hover:shadow-indigo-900/10 focus-visible:ring-indigo-500',
  'indigo-outline':
    'bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 focus-visible:ring-indigo-500',
  teal:
    'bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white shadow-sm hover:shadow-teal-900/10 focus-visible:ring-teal-500',
  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-600 hover:text-slate-900 focus-visible:ring-slate-400',
  dark:
    'bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white shadow-sm focus-visible:ring-slate-700',
  gradient:
    'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/20 focus-visible:ring-emerald-500',
  none: '',
};

const SIZES = {
  xs: 'px-2.5 py-1 text-xs rounded-lg font-semibold gap-1.5',
  sm: 'px-3 py-1.5 text-xs rounded-xl font-semibold gap-1.5',
  md: 'px-4 py-2 text-xs rounded-xl font-bold gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl font-bold gap-2',
  'icon-xs': 'p-1 rounded-md text-xs',
  'icon-sm': 'p-1.5 rounded-lg text-xs',
  icon: 'p-2 rounded-xl text-xs',
  'icon-lg': 'p-2.5 rounded-xl text-sm',
};

const SPINNER_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-4.5 h-4.5',
  'icon-xs': 'w-3 h-3',
  'icon-sm': 'w-3.5 h-3.5',
  icon: 'w-4 h-4',
  'icon-lg': 'w-4.5 h-4.5',
};

/**
 * Reusable Button Component with Automated & Isolated Spinner State
 *
 * - Automatically tracks async `onClick` promises and shows loading spinner.
 * - Supports explicit `loading` boolean prop.
 * - Prevents double clicks while loading is in progress.
 * - Ensures state cleanup via `finally` on completion or rejection.
 * - Multiple buttons maintain isolated loading states without interfering with one another.
 */
export function Button({
  children,
  onClick,
  loading: explicitLoading,
  loadingText,
  disabled = false,
  variant = 'primary',
  size = 'md',
  type = 'button',
  icon: IconProp,
  iconPosition = 'left',
  spinnerPlacement = 'left',
  className = '',
  title,
  ...props
}) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isEffectiveLoading = Boolean(
    explicitLoading !== undefined ? explicitLoading : internalLoading
  );
  const isDisabled = disabled || isEffectiveLoading;

  const handleClick = async (e) => {
    if (isDisabled) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (onClick) {
      try {
        const result = onClick(e);
        // If onClick returns a Promise (async function) and explicitLoading is not controlled
        if (result && typeof result.then === 'function') {
          if (explicitLoading === undefined) {
            setInternalLoading(true);
          }
          await result;
        }
      } catch (err) {
        // Log or let error propagate without swallowing
        console.error('Button action error:', err);
        throw err;
      } finally {
        if (isMountedRef.current && explicitLoading === undefined) {
          setInternalLoading(false);
        }
      }
    }
  };

  const variantClass = VARIANTS[variant] || VARIANTS.primary;
  const sizeClass = SIZES[size] || SIZES.md;
  const spinnerSize = SPINNER_SIZES[size] || 'w-4 h-4';

  const renderIcon = () => {
    if (!IconProp) return null;
    if (React.isValidElement(IconProp)) {
      return IconProp;
    }
    const IconComponent = IconProp;
    return <IconComponent className={`${spinnerSize} shrink-0`} />;
  };

  const isIconOnly = size.startsWith('icon');

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={handleClick}
      title={title}
      aria-busy={isEffectiveLoading}
      aria-disabled={isDisabled}
      className={`
        inline-flex items-center justify-center select-none
        transition-all duration-150 ease-in-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
        ${variantClass}
        ${sizeClass}
        ${
          isDisabled
            ? 'opacity-60 cursor-not-allowed pointer-events-none'
            : 'cursor-pointer active:scale-[0.98]'
        }
        ${className}
      `}
      {...props}
    >
      {/* If loading and it's an icon-only button, show spinner replacing icon */}
      {isEffectiveLoading && isIconOnly && (
        <Loader2 className={`${spinnerSize} animate-spin shrink-0`} />
      )}

      {/* Normal non-loading icon-only button */}
      {!isEffectiveLoading && isIconOnly && renderIcon()}

      {/* Regular button (with text/children) */}
      {!isIconOnly && (
        <>
          {/* Left Icon / Spinner */}
          {isEffectiveLoading && spinnerPlacement === 'left' ? (
            <Loader2 className={`${spinnerSize} animate-spin shrink-0`} />
          ) : (
            iconPosition === 'left' && renderIcon()
          )}

          {/* Button Text / Content */}
          {isEffectiveLoading && loadingText ? (
            <span>{loadingText}</span>
          ) : (
            children && <span>{children}</span>
          )}

          {/* Right Icon / Spinner */}
          {isEffectiveLoading && spinnerPlacement === 'right' ? (
            <Loader2 className={`${spinnerSize} animate-spin shrink-0`} />
          ) : (
            iconPosition === 'right' && renderIcon()
          )}
        </>
      )}
    </button>
  );
}

export default Button;
