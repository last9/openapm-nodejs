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

// export const instrumentNestRouterExecutionContext = (
//   routerExecutionContext: typeof RouterExecutionContext,
//   redMiddleware: Function
// ) => {
//   if (!isWrapped(routerExecutionContext.prototype, 'create')) {
//     wrap(
//       routerExecutionContext.prototype,
//       'create',
//       function (original: typeof routerExecutionContext.prototype.create) {
//         return function (
//           this: typeof routerExecutionContext.prototype.create,
//           ...args
//         ) {
//           const handler = original.apply(this, args);
//           return function (this: typeof handler, req, res, next) {
//             return handler.apply(this, [req, res, next]);
//           } as ReturnType<typeof routerExecutionContext.prototype.create>;
//         };
//       }
//     );
//   }
// };
