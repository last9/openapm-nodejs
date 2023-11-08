import type * as Express from 'express';
import type { RequestHandler } from 'express';
import { wrap } from '../shimmer';

export const instrumentExpress = (
  express: typeof Express,
  redMiddleware: RequestHandler
) => {
  let redMiddlewareAdded = false;

  const routerProto = express.Router as unknown as {
    use: (...handlers: RequestHandler[]) => Express.IRouter;
  };

  wrap(routerProto, 'use', (original) => {
    return function wrappedUse(
      this: typeof original,
      ...args: Parameters<typeof original>
    ) {
      if (!redMiddlewareAdded) {
        original.apply(this, [redMiddleware]);
        redMiddlewareAdded = true;
      }
      return original.apply(this, args);
    };
  });
};
