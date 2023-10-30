import type { NestFactoryStatic } from '@nestjs/core/nest-factory';
// import type { RouterExecutionContext } from '@nestjs/core/router/router-execution-context';
import { isWrapped, wrap } from '../shimmer';

export const instrumentNestFactory = (
  nestFactory: NestFactoryStatic,
  redMiddleware: Function
) => {
  // Check if the NestFactory is already wrapped
  if (!isWrapped(nestFactory, 'create')) {
    // Wrap using the wrapper function
    wrap(
      nestFactory,
      'create',
      function (original: NestFactoryStatic['create']) {
        return async function (this: NestFactoryStatic['create'], ...args) {
          const app = await original.apply(
            this,
            args as Parameters<NestFactoryStatic['create']>
          );
          // Add a global RED Middleware to the application
          app.use(redMiddleware);
          return app;
        };
      }
    );
  }
};
