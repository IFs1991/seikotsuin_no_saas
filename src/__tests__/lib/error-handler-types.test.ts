import { logError, AppError } from '@/lib/error-handler';

describe('ErrorHandler - Type Safety Tests', () => {
  it('should handle undefined properties correctly', () => {
    const error = new Error('Test error');
    const appError = new AppError('APP_ERROR', 'App Error');
    
    // これらのテストは現在失敗するはず（型エラーのため）
    expect(() => {
      logError(error);
      logError(appError);
    }).not.toThrow();
  });

  it('should handle error with undefined details', () => {
    const errorWithUndefinedDetails = {
      message: 'Test error',
      details: undefined
    };
    
    expect(() => {
      logError(errorWithUndefinedDetails as any);
    }).not.toThrow();
  });

  it('should handle error name and stack properties safely', () => {
    const partialError = {
      message: 'Partial error'
      // name and stack are undefined
    };
    
    expect(() => {
      logError(partialError as any);
    }).not.toThrow();
  });
});