import type * as PG from 'pg';
import promClient from 'prom-client';
import type OpenAPM from '../OpenAPM';
import { wrap } from '../shimmer';

export const instrumentPG = (pg: typeof PG | { default: typeof PG }) => {
  const histogram = new promClient.Histogram({
    name: 'db_requests_duration_milliseconds',
    help: 'Duration of DB transactions in milliseconds',
    labelNames: ['database_name', 'query', 'status'],
    buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
  });

  const pgModule = // @ts-ignore
    (pg?.[Symbol.toStringTag] === 'Module' ? pg.default : pg) as typeof PG;

  // wrap(
  //   pgModule.Client.prototype,
  //   'connect',
  //   (original: PG.Client['connect']) => {
  //     return async function (
  //       this: PG.Client['connect'],
  //       ...args: Parameters<PG.Client['connect']>
  //     ) {
  //       const result = await original.apply(this, args);
  //       return result;
  //     } as PG.Client['connect'];
  //   }
  // );

  wrap(pgModule.Client.prototype, 'query', (original: PG.Client['query']) => {
    return async function (
      this: PG.Client['query'],
      ...args: Parameters<PG.Client['query']>
    ) {
      let query = '';
      if (typeof args[0] === 'string') {
        query = args[0];
      } else if (typeof args[0] === 'object') {
        // @ts-ignore
        query = args[0]?.text;
      }
      const end = histogram.startTimer({
        query: query,
        database_name: '[db-name]'
      });
      try {
        const result = await original.apply(this, args);
        end({
          status: 'success'
        });
        return result;
      } catch (error) {
        end({
          status: 'failure'
        });
        throw error;
      }
    } as PG.Client['query'];
  });
};
