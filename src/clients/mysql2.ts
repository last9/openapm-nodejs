import promClient, { Histogram } from 'prom-client';
import type {
  Connection,
  createConnection,
  createPool,
  createPoolCluster
} from 'mysql2';
import { sqlParser } from '../utils/sqlParser';

///// Interfaces and Types ///////////////
export type MetricRegisterFunction = (params: {
  dbConfig: Connection['config'];
  queryString: string;
  queryTime: number;
}) => void;
//////////////////////////////////////////

////// Constants ////////////////////////
const symbols = {
  WRAP_CONNECTION: Symbol('WRAP_CONNECTION')
};

const sqlParserOptions = {
  database: 'MySQL'
};
/////////////////////////////////////////

//// Utils /////////////////////////////
const getQueryStringFromArgument = (
  arg:
    | string
    | {
        sql: string;
      }
) => {
  if (typeof arg === 'string') {
    return arg;
  }

  if (typeof arg.sql === 'string') {
    return arg.sql;
  }

  return '';
};
//////////////////////////////////////

/**
 *
 * @param fn queryable function that needs to be intercepted and instrumented
 * @param connectionConfig config for the connection/pool/pool cluster
 * @param metricRegisterFns array of functions that could be used to register metrics
 */
function interceptQueryable(
  fn: Connection['query'],
  connectionConfig: Connection['config'],
  metricRegisterFns: Array<MetricRegisterFunction>
): Connection['query'];
function interceptQueryable(
  fn: Connection['execute'],
  connectionConfig: Connection['config'],
  metricRegisterFns: Array<MetricRegisterFunction>
): Connection['execute'];
function interceptQueryable(
  fn: any,
  connectionConfig: Connection['config'],
  metricRegisterFns: Array<MetricRegisterFunction>
): any {
  return function (
    this: Connection['query'] | Connection['execute'],
    ...args: Parameters<Connection['query'] | Connection['execute']>
  ) {
    /**
     * Borrowed from response-time library which we use for express.js middleware
     * so that we get consistent measurement all across
     *
     * @todo Use utility from the prom-client
     *  */
    const startAt = process.hrtime();
    const result = fn.apply(this, args);
    const diff = process.hrtime(startAt);

    // Instrumentaion code goes here
    const time = diff[0] * 1e3 + diff[1] * 1e-6;

    const queryString = getQueryStringFromArgument(args[0]);
    for (const eachFn of metricRegisterFns) {
      eachFn?.({
        queryString,
        dbConfig: connectionConfig,
        queryTime: time
      });
    }

    return result;
  };
}

const wrapConnection = (
  connection: Connection,
  metricRegisterFns: Array<MetricRegisterFunction>
) => {
  // Get ProtoType for the connection
  const connectionProto = Object.getPrototypeOf(connection);
  if (!connectionProto?.[symbols.WRAP_CONNECTION]) {
    // Intercept the query Function
    /**
     * There are two ways in mysql2 library by which one can execurte the sql query
     * 1. .query
     * 2. .execute
     */
    connectionProto.query = interceptQueryable(
      connection.query,
      connection.config,
      metricRegisterFns
    );
    /**
     * Intercept only if the execute is available
     */
    if (typeof connection.execute !== 'undefined') {
      connectionProto.execute = interceptQueryable(
        connection.execute,
        connection.config,
        metricRegisterFns
      );
    }
    /**
     * This is to make sure we are only wrapping the connection once
     */
    connectionProto[symbols.WRAP_CONNECTION] = true;
  }
  return connection;
};

export const instrumentMySQL = (mysql: {
  createConnection: typeof createConnection;
  createPool: typeof createPool;
  createPoolCluster: typeof createPoolCluster;
}) => {
  // Default histogram metrics
  const histogram = new promClient.Histogram({
    name: 'db_requests_duration_milliseconds',
    help: 'Duration of DB transactions in milliseconds',
    labelNames: ['database_name', 'table_name', 'query', 'status'],
    buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
  });

  //
  const registerDBRequestDuration: MetricRegisterFunction = ({
    dbConfig,
    queryString,
    queryTime
  }) => {
    const tableList = sqlParser.tableList(queryString, sqlParserOptions);
    // for (let i = 0;  i < tableList.length; i++) {

    // }
    if (tableList.length > 0) {
      const [operation, _, tableName] = tableList[0].split('::');
      histogram
        .labels(
          dbConfig?.database ?? '[db-name]',
          tableName,
          operation.toUpperCase(),
          '200'
        )
        .observe(queryTime);
    }
  };

  /**
   * Create Proxy for the createConnection where we will wrap the connection
   * to intercept the query
   *  */
  mysql.createConnection = new Proxy(mysql.createConnection, {
    apply: (target, prop, args) => {
      const connection = Reflect.apply(target, prop, args);
      // Instrument Connection
      return wrapConnection(connection, [registerDBRequestDuration]);
    }
  });

  // mysql.createPool = new Proxy(mysql.createPool, {
  //   apply: (target, prop, args) => {
  //     const pool = Reflect.apply(target, prop, args);
  //     // Instrument Pool
  //     console.log(pool);
  //     return pool;
  //   }
  // });
};
