import type * as Express from 'express';
import type { RequestHandler } from 'express';
import { isWrapped, wrap } from '../shimmer';
import type OpenAPM from '../OpenAPM';
import { Server } from 'http';

export const instrumentExpress = (
  express: typeof Express,
  redMiddleware: RequestHandler,
  openapm: OpenAPM
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

  if (!isWrapped(express.application, 'listen')) {
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
          openapm.emit('application_started', {
            timestamp: new Date().toISOString(),
            event_name: 'express_app',
            event_state: 'start',
            entity_type: '',
            workspace: '',
            namespace: '',
            data_source_name: ''
          });
          const server = original.apply(this, args) as Server;

          wrap(server, 'close', function (original: Server['close']) {
            return function (
              this: Server['close'],
              ...args: Parameters<Server['close']>
            ) {
              openapm.emit('application_stopped', {
                timestamp: new Date().toISOString(),
                event_name: 'express_app',
                event_state: 'stop',
                entity_type: '',
                workspace: '',
                namespace: '',
                data_source_name: ''
              });
              return original.apply(this, args);
            };
          });

          return server;
        };
      }
    );
  }
};
