import type { RouterExecutionContext } from '@nestjs/core/router/router-execution-context';
import { isWrapped, wrap } from '../shimmer';

export const instrumentNestRouterExecutionContext = (
  routerExecutionContext: typeof RouterExecutionContext,
  redMiddleware: Function
) => {
  if (!isWrapped(routerExecutionContext.prototype, 'create')) {
    wrap(
      routerExecutionContext.prototype,
      'create',
      function (original: typeof routerExecutionContext.prototype.create) {
        return function (
          this: typeof routerExecutionContext.prototype.create,
          ...args
        ) {
          const handler = original.apply(this, args);
          return redMiddleware(handler);
        };
      }
    );
  }
};
