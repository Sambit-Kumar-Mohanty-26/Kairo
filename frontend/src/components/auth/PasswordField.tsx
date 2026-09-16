"use client";

import React, { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import FormField from "./FormField";

type PasswordFieldProps = Omit<React.ComponentProps<typeof FormField>, "type" | "endAdornment">;

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  props,
  ref
) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField
      {...props}
      ref={ref}
      type={visible ? "text" : "password"}
      endAdornment={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-[#8A8E86] hover:text-[#171917] transition-colors duration-200 p-1 -mr-1"
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      }
    />
  );
});

export default PasswordField;
