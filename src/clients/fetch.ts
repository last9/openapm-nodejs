import { getMetricClient } from '../get-metric-client';
import { wrap } from '../shimmer';

export const instrumentFetch = () => {
  const client = getMetricClient();

  const counter = new client.Counter({
    name: 'fetch_requests_total',
    help: 'Monitor the number of fetch requests made by the application to external services',
    labelNames: ['method', 'status', 'origin']
  });

  const histogram = new client.Histogram({
    name: 'fetch_duration_milliseconds',
    help: 'Monitor the duration of fetch requests made by the application to external services',
    labelNames: ['method', 'status', 'origin']
  });

  wrap(globalThis, 'fetch', (originalFetch): typeof globalThis.fetch => {
    return async function (
      this: typeof originalFetch,
      ...args: Parameters<typeof originalFetch>
    ) {
      const start = process.hrtime.bigint();
      const result = originalFetch.apply(this, args);

      if (result instanceof Promise) {
        await result;
      }
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e6;

      const origin = new URL(args[0].toString()).origin;

      counter.inc({
        method: args[1]?.method ?? 'GET',
        // @ts-ignore
        status: result.status as string,
        origin: origin.toString()
      });

      histogram.observe(
        {
          method: args[1]?.method ?? 'GET',
          // @ts-ignore
          status: result.status as string,
          origin: origin.toString()
        },
        duration
      );

      return result;
    } as typeof fetch;
  });
};
