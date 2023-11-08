import EventEmitter from 'events';
import type * as Express from 'express';
import type { RequestHandler } from 'express';
import { wrap } from '../shimmer';

export const instrumentExpress = (
  express: typeof Express,
  redMiddleware: RequestHandler,
  events: EventEmitter
) => {
  let redMiddlewareAdded = false;

  const routerProto = express.Router as unknown as Express.Router['prototype'];

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

  wrap(
    express.application,
    'listen',
    function (
      original: (typeof Express)['application']['listen']['prototype']
    ) {
      return function (
        this: typeof original,
        ...args: Parameters<typeof original>
      ) {
        events.emit('application_started');
        return original.apply(this, args);
      };
    }
  );
};
