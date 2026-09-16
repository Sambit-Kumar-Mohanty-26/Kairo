import React, { forwardRef, useId } from "react";

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** rendered on the label row — used for the "Forgot password?" link */
  labelAction?: React.ReactNode;
  /** rendered inside the input, right-aligned — used for the eye toggle */
  endAdornment?: React.ReactNode;
}

/** One underlined field, styled like the site's own mono-labelled inputs
    rather than a boxed shadcn control. */
const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, labelAction, endAdornment, id, className = "", ...props },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={fieldId}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8E86]"
        >
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={fieldId}
          ref={ref}
          className={`w-full bg-transparent border-b py-2.5 ${
            endAdornment ? "pr-8" : ""
          } font-sans text-[15px] text-[#171917] placeholder:text-[#B0B4AC] outline-none transition-colors duration-200 ${
            error ? "border-[#E11D48]" : "border-[#DCDDCB] focus:border-[#171917]"
          } ${className}`}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${fieldId}-note` : undefined}
          {...props}
        />
        {endAdornment && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">{endAdornment}</div>
        )}
      </div>
      {(error || hint) && (
        <span
          id={`${fieldId}-note`}
          className={`font-mono text-[10.5px] tracking-[0.02em] ${
            error ? "text-[#E11D48]" : "text-[#8A8E86]"
          }`}
        >
          {error ?? hint}
        </span>
      )}
    </div>
  );
});

export default FormField;
