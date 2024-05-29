import type * as PG from 'pg';
import promClient from 'prom-client';
import { wrap } from '../shimmer';
import { maskValuesInSQLQuery } from '../utils';

export const instrumentPG = (pg: typeof PG | { default: typeof PG }) => {
  const histogram = new promClient.Histogram({
    name: 'db_requests_duration_milliseconds',
    help: 'Duration of DB transactions in milliseconds',
    labelNames: ['database_name', 'query', 'status'],
    buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
  });

  const pgModule = // @ts-ignore
    (pg?.[Symbol.toStringTag] === 'Module' ? pg.default : pg) as typeof PG;

  wrap(pgModule.Client.prototype, 'query', (original: PG.Client['query']) => {
    return async function (
      this: PG.Client['query'] & {
        connectionParameters: {
          database: string;
        };
      },
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
        query: maskValuesInSQLQuery(query).substring(0, 100),
        database_name: this.connectionParameters.database ?? '[db-name]'
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
