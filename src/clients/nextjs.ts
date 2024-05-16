import type NextNodeServer from 'next/dist/server/next-server';
import type {
  NextIncomingMessage,
  RequestMeta
} from 'next/dist/server/request-meta';

import prom, { Counter, Histogram } from 'prom-client';
import { wrap } from '../shimmer';
import OpenAPM from '../OpenAPM';

interface NextUtilities {
  getRequestMeta: <K extends keyof RequestMeta>(
    req: NextIncomingMessage,
    key?: K
  ) => RequestMeta[K] | RequestMeta;
}

export const instrumentNextjs = (
  nextServer: typeof NextNodeServer,
  nextUtilities: NextUtilities,
  { counter, histogram }: { counter?: Counter; histogram?: Histogram },
  openapm: OpenAPM
) => {
  const { getRequestMeta } = nextUtilities;

  if (typeof counter === 'undefined') {
    counter = new prom.Counter(openapm.requestsCounterConfig);
  }

  if (typeof histogram === 'undefined') {
    histogram = new prom.Histogram(openapm.requestDurationHistogramConfig);
  }

  const wrappedHandler = (
    handler: ReturnType<NextNodeServer['getRequestHandler']>
  ) => {
    return async (
      ...args: Parameters<ReturnType<NextNodeServer['getRequestHandler']>>
    ) => {
      const [req, res] = args;
      const start = process.hrtime.bigint();

      const result = handler(...args);
      if (result instanceof Promise) {
        await result;
      }
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e6;
      const requestMetaMatch = getRequestMeta(
        req,
        'match'
      ) as RequestMeta['match'];
      const parsedPath = requestMetaMatch?.definition.pathname;

      counter?.inc({
        path: parsedPath !== '' ? parsedPath : '/',
        method: req.method ?? 'GET',
        status: res.statusCode?.toString() ?? '500'
        // ...(store?.labels ?? {}) -> // TODO: Implement dynamic labels
      });

      histogram?.observe(
        {
          path: parsedPath !== '' ? parsedPath : '/',
          method: req.method ?? 'GET',
          status: res.statusCode?.toString() ?? '500'
          // ...(store?.labels ?? {}) -> // TODO: Implement dynamic labels
        },
        duration
      );

      return result;
    };
  };

  wrap(nextServer.prototype, 'getRequestHandler', function (original) {
    return function (
      this: NextNodeServer['getRequestHandler'],
      ...args: Parameters<NextNodeServer['getRequestHandler']>
    ) {
      const handler = original.apply(this, args) as ReturnType<
        NextNodeServer['getRequestHandler']
      >;
      return wrappedHandler(handler);
    };
  });
};
