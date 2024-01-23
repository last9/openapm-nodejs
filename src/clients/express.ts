import * as os from 'os';
import Debug from 'debug';
import type * as Express from 'express';
import type { RequestHandler } from 'express';
import { isWrapped, wrap } from '../shimmer';
import type OpenAPM from '../OpenAPM';
import { Server } from 'http';

const debug = Debug('openapm:express');

export const instrumentExpress = (
  express: typeof Express,
  redMiddleware: RequestHandler,
  openapm: OpenAPM
) => {
  let redMiddlewareAdded = false;

  const routerProto = express.Router as unknown as Express.Router['prototype'];

  wrap(routerProto, 'use', (original) => {
    debug('Wrapping Router.use');
    return function wrappedUse(
      this: typeof original,
      ...args: Parameters<typeof original>
    ) {
      if (!redMiddlewareAdded) {
        original.apply(this, [redMiddleware]);
        debug('RED middleware attached');
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
        debug('Wrapping application.listen');
        return function (
          this: typeof original,
          ...args: Parameters<typeof original>
        ) {
          openapm.emit('application_started', {
            timestamp: new Date().toISOString(),
            event_name: `${openapm.program}_app`,
            event_state: 'start',
            entity_type: 'app',
            workspace: os.hostname(),
            namespace: openapm.environment,
            data_source_name: openapm.levitateConfig?.dataSourceName ?? ''
          });
          const server = original.apply(this, args) as Server;
          return server;
        };
      }
    );
  }
};
