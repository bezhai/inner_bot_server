export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  exponential?: boolean;
  retryIf?: (error: any) => boolean;
}

export function Retry(options: RetryOptions): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error;
      
      for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error as Error;
          
          // Check if we should retry this error
          if (options.retryIf && !options.retryIf(error)) {
            throw error;
          }
          
          // Don't retry on the last attempt
          if (attempt === options.maxAttempts) {
            break;
          }
          
          // Calculate delay
          const delay = options.exponential 
            ? options.backoffMs * Math.pow(2, attempt - 1)
            : options.backoffMs;
          
          console.log(`Retry attempt ${attempt}/${options.maxAttempts} after ${delay}ms for ${String(propertyKey)}`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError!;
    };

    return descriptor;
  };
}