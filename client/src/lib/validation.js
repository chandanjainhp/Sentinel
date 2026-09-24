  /**
 * Form Validation Utilities
 * Provides reusable validation rules for forms
 */

export const validationRules = {
  // Email validation
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!value) return 'Email is required';
    if (!emailRegex.test(value)) return 'Please enter a valid email address';
    return null;
  },

  // Password validation (min 6 chars)
  password: (value) => {
    if (!value) return 'Password is required';
    if (value.length < 6) return 'Password must be at least 6 characters';
    return null;
  },

  // Password strength validation
  passwordStrength: (value) => {
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecial = /[!@#$%^&*]/.test(value);

    const strength = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

    if (strength < 2) return 'Password should contain uppercase, lowercase, numbers, and symbols';
    return null;
  },

  // Confirm password match
  confirmPassword: (value, password) => {
    if (!value) return 'Please confirm your password';
    if (value !== password) return 'Passwords do not match';
    return null;
  },

  // Full name validation
  fullName: (value) => {
    if (!value) return 'Full name is required';
    if (value.trim().length < 2) return 'Please enter your full name';
    return null;
  },

  // Required field
  required: (value, fieldName = 'This field') => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return `${fieldName} is required`;
    }
    return null;
  },
};

/**
 * Validate entire form object
 * @param {Object} data - Form data object
 * @param {Object} schema - Validation schema { fieldName: validationFunction }
 * @returns {Object} Errors object or empty if valid
 */
export const validateForm = (data, schema) => {
  const errors = {};

  Object.keys(schema).forEach((field) => {
    const validator = schema[field];
    const value = data[field];

    if (typeof validator === 'function') {
      const error = validator(value, data);
      if (error) errors[field] = error;
    }
  });

  return errors;
};

/**
 * Check if form has any errors
 */
export const hasErrors = (errors) => {
  return Object.keys(errors).length > 0;
};
