import { forwardRef, useId } from "react";

/**
 * Input wrapper with label/hint/error.
 *
 * - Defaults to `w-full` per mobile-design.md.
 * - Pass `as="textarea"` for a multi-line variant or `as="select"` to render
 *   a styled <select> (children become <option>s).
 * - For email/url/tel the LTR direction is handled globally in globals.css.
 */
const BASE_FIELD =
  "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 transition";

const Input = forwardRef(function Input(
  {
    as = "input",
    label,
    hint,
    error,
    required,
    className = "",
    inputClassName = "",
    id: providedId,
    children,
    ...rest
  },
  ref
) {
  const reactId = useId();
  const id = providedId || `field-${reactId}`;
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  const fieldClass = `${BASE_FIELD} ${error ? "border-red-300 focus:ring-red-500/30 focus:border-red-500" : ""} ${inputClassName}`;
  const describedBy = error ? errorId : hint ? helperId : undefined;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
          {required ? <span className="text-red-500 ms-1" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {as === "textarea" ? (
        <textarea
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          className={fieldClass}
          {...rest}
        />
      ) : as === "select" ? (
        <select
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          className={fieldClass}
          {...rest}
        >
          {children}
        </select>
      ) : (
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          className={fieldClass}
          {...rest}
        />
      )}
      {error ? (
        <p id={errorId} className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p id={helperId} className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
});

export default Input;
