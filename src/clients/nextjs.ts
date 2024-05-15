import type NextNodeServer from 'next/dist/server/next-server';
import prom, { Counter, Histogram } from 'prom-client';
import { wrap } from '../shimmer';
import OpenAPM from '../OpenAPM';
import type { AsyncLocalStorage } from 'async_hooks';
import { NEXT_REQUEST_META } from 'next/dist/server/request-meta';

export const instrumentNextjs = (
  nextServer: typeof NextNodeServer,
  nextUtities: {
    getRequestMeta: any;
    requestAsyncStorage?: AsyncLocalStorage<{
      labels: Record<string, string | number | boolean>;
    }>;
  },
  { counter, histogram }: { counter?: Counter; histogram?: Histogram },
  openapm: OpenAPM
) => {
  const { requestAsyncStorage, getRequestMeta } = nextUtities;

  const wrappedHandler = (
    handler: ReturnType<NextNodeServer['getRequestHandler']>,
    ctx: {
      counter?: Counter;
      histogram?: Histogram;
    }
  ) => {
    return async function (
      ...args: Parameters<ReturnType<NextNodeServer['getRequestHandler']>>
    ) {
      const [req, res] = args;
      const start = process.hrtime.bigint();

      const result = handler(...args);
      if (result instanceof Promise) {
        await result;
      }
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e6;
      // @ts-ignore
      const requestMetaMatch = getRequestMeta(req, 'match');
      const parsedPath = requestMetaMatch?.definition.pathname;

      const store = requestAsyncStorage?.getStore();

      ctx.counter?.inc({
        path: parsedPath !== '' ? parsedPath : '/',
        method: req.method ?? 'GET',
        status: res.statusCode?.toString() ?? '500',
        ...(store?.labels ?? {})
      });

      ctx.histogram?.observe(
        {
          path: parsedPath !== '' ? parsedPath : '/',
          method: req.method ?? 'GET',
          status: res.statusCode?.toString() ?? '500',
          ...(store?.labels ?? {})
        },
        duration
      );

      return result;
    };
  };

  const ctx = {
    counter,
    histogram
  };

  if (typeof ctx.counter === 'undefined') {
    ctx.counter = new prom.Counter(openapm.requestsCounterConfig);
  }

  if (typeof ctx.histogram === 'undefined') {
    ctx.histogram = new prom.Histogram(openapm.requestDurationHistogramConfig);
  }

  wrap(nextServer.prototype, 'getRequestHandler', function (original) {
    return function (
      this: NextNodeServer['getRequestHandler'],
      ...args: Parameters<NextNodeServer['getRequestHandler']>
    ) {
      const handler = original.apply(this, args) as ReturnType<
        NextNodeServer['getRequestHandler']
      >;
      return wrappedHandler(handler, {
        counter,
        histogram
      });
    };
  });
};
