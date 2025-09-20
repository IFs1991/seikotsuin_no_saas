// =================================================================
// Error Handler Tests - エラーハンドリングのテスト
// =================================================================

import {
  createApiError,
  createValidationError,
  normalizeError,
  normalizeSupabaseError,
  ValidationErrorCollector,
  validation,
  ERROR_CODES,
} from '../../lib/error-handler';

describe('Error Handler', () => {
  describe('createApiError', () => {
    it('should create ApiError with required fields', () => {
      const error = createApiError(ERROR_CODES.VALIDATION_ERROR, 'Test error');

      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.message).toBe('Test error');
      expect(error.timestamp).toBeDefined();
    });

    it('should use default message if not provided', () => {
      const error = createApiError(ERROR_CODES.VALIDATION_ERROR);

      expect(error.message).toBe('入力値にエラーがあります');
    });

    it('should include details and path', () => {
      const details = { field: 'name' };
      const path = '/api/test';
      const error = createApiError(
        ERROR_CODES.VALIDATION_ERROR,
        'Test',
        details,
        path
      );

      expect(error.details).toEqual(details);
      expect(error.path).toBe(path);
    });
  });

  describe('createValidationError', () => {
    it('should create ValidationError', () => {
      const error = createValidationError(
        'name',
        'Name is required',
        'invalid'
      );

      expect(error.field).toBe('name');
      expect(error.message).toBe('Name is required');
      expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(error.value).toBe('invalid');
    });
  });

  describe('normalizeError', () => {
    it('should normalize Error object', () => {
      const originalError = new Error('Test error');
      const normalized = normalizeError(originalError, '/api/test');

      expect(normalized.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(normalized.message).toBe('Test error');
      expect(normalized.path).toBe('/api/test');
    });

    it('should handle TypeError for fetch errors', () => {
      const fetchError = new TypeError('fetch error');
      const normalized = normalizeError(fetchError, '/api/test');

      expect(normalized.code).toBe(ERROR_CODES.NETWORK_ERROR);
      expect(normalized.message).toBe('fetch error');
    });

    it('should handle non-Error objects', () => {
      const normalized = normalizeError('string error', '/api/test');

      expect(normalized.code).toBe(ERROR_CODES.UNKNOWN_ERROR);
      expect(normalized.message).toBe('An unknown error occurred');
    });
  });

  describe('normalizeSupabaseError', () => {
    it('should handle unique constraint violation', () => {
      const supabaseError = { code: '23505', message: 'duplicate key' };
      const normalized = normalizeSupabaseError(supabaseError, '/api/test');

      expect(normalized.code).toBe(ERROR_CODES.UNIQUE_CONSTRAINT_VIOLATION);
      expect(normalized.message).toBe('このデータは既に存在します');
    });

    it('should handle not found error', () => {
      const supabaseError = { code: 'PGRST116', message: 'No rows found' };
      const normalized = normalizeSupabaseError(supabaseError, '/api/test');

      expect(normalized.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect(normalized.message).toBe('データが見つかりません');
    });

    it('should handle connection errors', () => {
      const supabaseError = { message: 'connection failed' };
      const normalized = normalizeSupabaseError(supabaseError, '/api/test');

      expect(normalized.code).toBe(ERROR_CODES.DATABASE_CONNECTION_ERROR);
      expect(normalized.message).toBe('データベースに接続できません');
    });
  });

  describe('ValidationErrorCollector', () => {
    let collector: ValidationErrorCollector;

    beforeEach(() => {
      collector = new ValidationErrorCollector();
    });

    it('should collect validation errors', () => {
      collector.add('name', 'Name is required');
      collector.add('email', 'Invalid email format');

      expect(collector.hasErrors()).toBe(true);
      expect(collector.getErrors()).toHaveLength(2);

      const errors = collector.getErrors();
      expect(errors[0].field).toBe('name');
      expect(errors[1].field).toBe('email');
    });

    it('should add error conditionally', () => {
      collector.addIf(true, 'name', 'Name is required');
      collector.addIf(false, 'email', 'Email is required');

      expect(collector.getErrors()).toHaveLength(1);
      expect(collector.getErrors()[0].field).toBe('name');
    });

    it('should create API error from validation errors', () => {
      collector.add('name', 'Name is required');
      const apiError = collector.getApiError();

      expect(apiError.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(apiError.details?.validationErrors).toHaveLength(1);
    });

    it('should clear errors', () => {
      collector.add('name', 'Name is required');
      collector.clear();

      expect(collector.hasErrors()).toBe(false);
      expect(collector.getErrors()).toHaveLength(0);
    });
  });

  describe('validation functions', () => {
    describe('required', () => {
      it('should return error for null/undefined/empty values', () => {
        expect(validation.required(null, 'name')).not.toBeNull();
        expect(validation.required(undefined, 'name')).not.toBeNull();
        expect(validation.required('', 'name')).not.toBeNull();
        expect(validation.required('value', 'name')).toBeNull();
      });
    });

    describe('email', () => {
      it('should validate email format', () => {
        expect(validation.email('test@example.com', 'email')).toBeNull();
        expect(validation.email('invalid-email', 'email')).not.toBeNull();
        expect(validation.email('', 'email')).toBeNull(); // empty is allowed
      });
    });

    describe('minLength', () => {
      it('should validate minimum length', () => {
        expect(validation.minLength('abc', 3, 'name')).toBeNull();
        expect(validation.minLength('ab', 3, 'name')).not.toBeNull();
        expect(validation.minLength('', 3, 'name')).toBeNull(); // empty is allowed
      });
    });

    describe('maxLength', () => {
      it('should validate maximum length', () => {
        expect(validation.maxLength('abc', 5, 'name')).toBeNull();
        expect(validation.maxLength('abcdef', 5, 'name')).not.toBeNull();
      });
    });

    describe('numeric', () => {
      it('should validate numeric values', () => {
        expect(validation.numeric(123, 'amount')).toBeNull();
        expect(validation.numeric('123', 'amount')).toBeNull();
        expect(validation.numeric('abc', 'amount')).not.toBeNull();
        expect(validation.numeric(null, 'amount')).toBeNull(); // null is allowed
      });
    });

    describe('positiveNumber', () => {
      it('should validate positive numbers', () => {
        expect(validation.positiveNumber(10, 'amount')).toBeNull();
        expect(validation.positiveNumber(0, 'amount')).toBeNull();
        expect(validation.positiveNumber(-5, 'amount')).not.toBeNull();
        expect(validation.positiveNumber(null as any, 'amount')).toBeNull(); // null is allowed
      });
    });

    describe('dateFormat', () => {
      it('should validate date format', () => {
        expect(validation.dateFormat('2024-01-15', 'date')).toBeNull();
        expect(
          validation.dateFormat('2024-01-15T10:00:00Z', 'date')
        ).toBeNull();
        expect(validation.dateFormat('invalid-date', 'date')).not.toBeNull();
        expect(validation.dateFormat('', 'date')).toBeNull(); // empty is allowed
      });
    });

    describe('uuid', () => {
      it('should validate UUID format', () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        const invalidUuid = 'not-a-uuid';

        expect(validation.uuid(validUuid, 'id')).toBeNull();
        expect(validation.uuid(invalidUuid, 'id')).not.toBeNull();
        expect(validation.uuid('', 'id')).toBeNull(); // empty is allowed
      });
    });
  });
});
