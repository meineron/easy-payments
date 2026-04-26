"use client";

import { forwardRef } from "react";

/**
 * Button primitive.
 *
 * Variants codify the colors used across the dashboard (see mobile-design.md
 * "primary `bg-blue-600 text-white`, danger `bg-red-600 text-white`").
 *
 * `mobileFullWidth` defaults to true — primary mobile actions take the row.
 * Set to false for inline icon buttons or 50/50 grid actions.
 */
const VARIANT = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300",
  secondary:
    "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:text-gray-300",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300",
  ghost: "text-gray-700 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-300",
  link: "text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline disabled:text-blue-300 px-0",
};

const SIZE = {
  sm: "text-xs px-2.5 py-1.5 rounded-md",
  md: "text-sm px-4 py-2 rounded-lg",
  lg: "text-sm px-5 py-2.5 rounded-lg",
  icon: "p-2 rounded-lg",
};

const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    type = "button",
    fullWidth = false,
    mobileFullWidth = false,
    loading = false,
    iconStart,
    iconEnd,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref
) {
  const widthCls = fullWidth
    ? "w-full"
    : mobileFullWidth
    ? "w-full sm:w-auto"
    : "";

  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed ${VARIANT[variant] || VARIANT.primary} ${SIZE[size] || SIZE.md} ${widthCls} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="inline-block w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin"
        />
      ) : iconStart ? (
        <span aria-hidden="true" className="flex-shrink-0">{iconStart}</span>
      ) : null}
      <span className="truncate">{children}</span>
      {!loading && iconEnd ? (
        <span aria-hidden="true" className="flex-shrink-0">{iconEnd}</span>
      ) : null}
    </button>
  );
});

export default Button;
