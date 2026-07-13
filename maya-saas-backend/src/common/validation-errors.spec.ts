import type { ValidationError } from 'class-validator';

import { flattenValidationErrors } from './validation-errors';

describe('flattenValidationErrors', () => {
  it('keeps top-level validation errors', () => {
    const errors: ValidationError[] = [
      {
        property: 'ownerEmail',
        constraints: { isEmail: 'ownerEmail must be an email' },
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      {
        field: 'ownerEmail',
        message: 'ownerEmail must be an email',
      },
    ]);
  });

  it('returns paths for nested array fields', () => {
    const errors: ValidationError[] = [
      {
        property: 'services',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'name',
                constraints: {
                  minLength:
                    'name must be longer than or equal to 2 characters',
                },
              },
            ],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      {
        field: 'services.0.name',
        message: 'name must be longer than or equal to 2 characters',
      },
    ]);
  });
});
