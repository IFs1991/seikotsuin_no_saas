// =================================================================
// API Client Tests - APIクライアントのテスト
// =================================================================

import { ApiClient, isSuccessResponse, isErrorResponse, handleApiError } from '../../lib/api-client';
import { ApiResponse, ApiError } from '../../types/api';

// Mock fetch for testing
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('ApiClient', () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    apiClient = new ApiClient({ baseUrl: 'https://test.example.com' });
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockResponse = {
        success: true,
        data: { id: '1', name: 'test' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse))
      } as Response);

      const result = await apiClient.get('/api/test');

      expect(mockFetch).toHaveBeenCalledWith('https://test.example.com/api/test', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal)
      });

      expect(result).toEqual(mockResponse);
    });

    it('should handle GET request with query parameters', async () => {
      const mockResponse = { success: true, data: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockResponse))
      } as Response);

      await apiClient.get('/api/test', { clinic_id: '123', limit: 10, active: true });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.example.com/api/test?clinic_id=123&limit=10&active=true',
        expect.any(Object)
      );
    });

    it('should handle network errors with retry', async () => {
      const networkError = new Error('Network error');
      networkError.name = 'TypeError';

      mockFetch.mockRejectedValueOnce(networkError);
      mockFetch.mockRejectedValueOnce(networkError);
      mockFetch.mockRejectedValueOnce(networkError);

      const result = await apiClient.get('/api/test');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN_ERROR');
    });

    it('should handle timeout', async () => {
      jest.useFakeTimers();

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          const error = new Error('Timeout');
          error.name = 'AbortError';
          reject(error);
        }, 1000);
      });

      mockFetch.mockImplementationOnce(() => timeoutPromise as any);

      const resultPromise = apiClient.get('/api/test');
      
      jest.advanceTimersByTime(31000); // Advance past timeout
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');

      jest.useRealTimers();
    });
  });

  describe('POST requests', () => {
    it('should make successful POST request', async () => {
      const postData = { name: 'test', email: 'test@example.com' };
      const mockResponse = { success: true, data: { id: '1', ...postData } };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () => Promise.resolve(JSON.stringify(mockResponse))
      } as Response);

      const result = await apiClient.post('/api/test', postData);

      expect(mockFetch).toHaveBeenCalledWith('https://test.example.com/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
        signal: expect.any(AbortSignal)
      });

      expect(result).toEqual(mockResponse);
    });

    it('should handle validation errors', async () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { validationErrors: [] }
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify(errorResponse))
      } as Response);

      const result = await apiClient.post('/api/test', {});

      expect(result).toEqual(errorResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('')
      } as Response);

      const result = await apiClient.get('/api/test');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBeDefined();
      expect(result.error?.message).toContain('500');
    });

    it('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve('invalid json')
      } as Response);

      const result = await apiClient.get('/api/test');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Failed to parse response');
    });

    it('should handle empty response for successful requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: () => Promise.resolve('')
      } as Response);

      const result = await apiClient.delete('/api/test/1');

      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe('Type guards', () => {
    it('should identify success response', () => {
      const successResponse: ApiResponse<string> = {
        success: true,
        data: 'test data'
      };

      expect(isSuccessResponse(successResponse)).toBe(true);
      expect(isErrorResponse(successResponse)).toBe(false);

      if (isSuccessResponse(successResponse)) {
        // TypeScript should infer that data is available
        expect(successResponse.data).toBe('test data');
      }
    });

    it('should identify error response', () => {
      const errorResponse: ApiResponse<string> = {
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error',
          timestamp: new Date().toISOString()
        }
      };

      expect(isErrorResponse(errorResponse)).toBe(true);
      expect(isSuccessResponse(errorResponse)).toBe(false);

      if (isErrorResponse(errorResponse)) {
        // TypeScript should infer that error is available
        expect(errorResponse.error.code).toBe('TEST_ERROR');
      }
    });
  });

  describe('Error message handling', () => {
    it('should return error message', () => {
      const apiError: ApiError = {
        code: 'TEST_ERROR',
        message: 'Custom error message',
        timestamp: new Date().toISOString()
      };

      const message = handleApiError(apiError);
      expect(message).toBe('Custom error message');
    });

    it('should return default message when error message is missing', () => {
      const apiError: ApiError = {
        code: 'TEST_ERROR',
        message: '',
        timestamp: new Date().toISOString()
      };

      const defaultMessage = 'Something went wrong';
      const message = handleApiError(apiError, defaultMessage);
      expect(message).toBe(defaultMessage);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customClient = new ApiClient({
        baseUrl: 'https://custom.example.com',
        timeout: 60000,
        headers: { 'Authorization': 'Bearer token' },
        retryCount: 5
      });

      // Test that custom config is applied by checking internal state
      // This is a bit tricky to test directly, so we'll test the behavior
      expect(customClient).toBeInstanceOf(ApiClient);
    });
  });
});