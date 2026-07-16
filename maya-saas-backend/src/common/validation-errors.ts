import type { ValidationError } from 'class-validator';

export interface ValidationIssue {
  field: string;
  message: string;
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = [parentPath, error.property].filter(Boolean).join('.');
    const ownIssues = Object.values(error.constraints || {}).map((message) => ({
      field,
      message,
    }));
    const childIssues = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];

    return [...ownIssues, ...childIssues];
  });
}
