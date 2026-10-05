import React from "react";
import { Input } from "../ui/Input";
import { cn } from "../../utils/cn";

export const AuthInput = React.forwardRef(
  ({ icon: Icon, label, error, className, ...props }, ref) => {
    return (
      <div className={cn("space-y-1.5 w-full", className)}>
        {label && (
          <label
            htmlFor={props.id || props.name}
            className="text-sm font-medium leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              <Icon size={18} />
            </div>
          )}
          <Input
            ref={ref}
            id={props.id || props.name}
            className={cn(
              "h-11 shadow-sm transition-all duration-200",
              Icon && "pl-10",
              error && "border-red-500 focus-visible:ring-red-500"
            )}
            {...props}
          />
        </div>
        {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
      </div>
    );
  }
);

AuthInput.displayName = "AuthInput";
