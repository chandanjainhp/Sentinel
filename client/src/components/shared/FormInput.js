'use client';

import { useState } from 'react';

/**
 * Reusable form input component with validation
 */
export default function FormInput({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  required = true,
  autoComplete,
  icon: Icon,
  showPasswordToggle = false,
}) {
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div className="mb-4">
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-2">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-3 text-text-secondary">
            <Icon size={18} />
          </div>
        )}

        <input
          type={inputType}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          autoComplete={autoComplete}
          className={`w-full px-4 ${Icon ? 'pl-10' : 'pl-4'} py-2.5 rounded-lg border transition-colors
            bg-surface-3 border-primary-300 text-text-primary placeholder-text-secondary
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-[rgba(39,93,197,1)]/20
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-error focus:border-error' : 'border-primary-300'}
          `}
        />

        {showPasswordToggle && isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-3 text-text-secondary hover:text-text-primary transition"
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-14-14zM10 4a8.006 8.006 0 00-6.954 11.576 1 1 0 101.732.866A6 6 0 1010 4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-sm text-error flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18.101 12.93l-8.784-4.03c-.417-.191-.945-.191-1.363 0l-8.784 4.03A1 1 0 001 11.977V14c0 3.314 2.686 6 6 6h6c3.314 0 6-2.686 6-6v-2.023a1 1 0 00-.899-1.047zm-7.101 1.07a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
