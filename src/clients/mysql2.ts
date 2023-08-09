import promClient from 'prom-client';
import type {
  Connection,
  Pool,
  PoolCluster,
  Query,
  createConnection,
  createPool,
  createPoolCluster
} from 'mysql2';
import { sqlParser } from '../utils/sqlParser';

///// Interfaces and Types ///////////////
export type MetricRegisterFunction = (params: {
  connConfig: Connection['config'];
  queryString: string;
  queryTime: number;
}) => void;
//////////////////////////////////////////

////// Constants ////////////////////////
const symbols = {
  WRAP_CONNECTION: Symbol('WRAP_CONNECTION'),
  WRAP_POOL: Symbol('WRAP_POOL'),
  WRAP_GET_CONNECTION_CB: Symbol('WRAP_GET_CONNECTION_CB'),
  WRAP_POOL_CLUSTER: Symbol('WRAP_POOL_CLUSTER')
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
  connectionConfig: Connection['config'] | Pool['config'],
  metricRegisterFns: Array<MetricRegisterFunction>
): Connection['query'];
function interceptQueryable(
  fn: Connection['execute'],
  connectionConfig: Connection['config'] | Pool['config'],
  metricRegisterFns: Array<MetricRegisterFunction>
): Connection['execute'];
function interceptQueryable(
  fn: any,
  connectionConfig: Connection['config'] | Pool['config'],
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
    const start = process.hrtime.bigint();
    const result = fn.apply(this, args) as Query;
    const end = process.hrtime.bigint();

    // Instrumentaion code goes here
    const time = parseInt((end - start).toString()) / 1000000;
    const queryString = getQueryStringFromArgument(args[0]);

    for (const eachFn of metricRegisterFns) {
      eachFn?.({
        queryString,
        connConfig: connectionConfig,
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

const wrapPoolGetConnectionCB = (
  cb: Parameters<Pool['getConnection']>['0'],
  metricRegisterFns: Array<MetricRegisterFunction>
): Parameters<Pool['getConnection']>['0'] => {
  return function (this: Parameters<Pool['getConnection']>['0'], ...args) {
    const [_, conn] = args;
    wrapConnection(conn, metricRegisterFns);
    return cb.apply(this, args);
  };
};

const wrapPoolGetConnection = (
  getConnectionFn: Pool['getConnection'],
  metricRegisterFns: Array<MetricRegisterFunction>
) => {
  return function (
    this: Pool['getConnection'],
    ...args: Parameters<Pool['getConnection']>
  ) {
    let callbackFn = args[args.length - 1];
    const getConnectionFnProto = Object.getPrototypeOf(getConnectionFn);

    if (!getConnectionFnProto?.[symbols.WRAP_GET_CONNECTION_CB]) {
      callbackFn = wrapPoolGetConnectionCB(callbackFn, metricRegisterFns);
      args[args.length - 1] = callbackFn;
      getConnectionFnProto[symbols.WRAP_GET_CONNECTION_CB] = true;
    }

    return getConnectionFn.apply(this, args);
  };
};

const wrapPool = (
  pool: Pool,
  metricRegisterFns: Array<MetricRegisterFunction>
) => {
  const poolProto = Object.getPrototypeOf(pool);
  if (!poolProto?.[symbols.WRAP_POOL]) {
    poolProto.query = interceptQueryable(
      pool.query,
      pool.config,
      metricRegisterFns
    );

    if (typeof pool.execute !== 'undefined') {
      poolProto.execute = interceptQueryable(
        pool.execute,
        pool.config,
        metricRegisterFns
      );
    }

    poolProto.getConnection = wrapPoolGetConnection(
      pool['getConnection'],
      metricRegisterFns
    );
    poolProto[symbols.WRAP_POOL] = true;
  }

  return pool;
};

const wrapPoolCluster = (
  poolCluster: PoolCluster,
  metricRegisterFns: Array<MetricRegisterFunction>
) => {
  let poolClusterProto = Object.getPrototypeOf(poolCluster);
  if (!poolClusterProto?.[symbols.WRAP_POOL_CLUSTER]) {
    poolClusterProto = new Proxy(poolClusterProto, {});
    poolClusterProto[symbols.WRAP_POOL_CLUSTER] = true;
  }
  return poolCluster;
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
    labelNames: ['database_name', 'query', 'status'],
    buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
  });

  //
  const registerDBRequestDuration: MetricRegisterFunction = ({
    connConfig,
    queryString,
    queryTime
  }) => {
    const tableList = sqlParser.tableList(queryString, sqlParserOptions);
    if (tableList.length > 0) {
      const [operation] = tableList[0].split('::');
      histogram
        .labels(
          connConfig?.database ?? '[db-name]',
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

  /**
   * Create Proxy for the createPool where we will wrap the connection
   * to intercept the query
   *  */
  mysql.createPool = new Proxy(mysql.createPool, {
    apply: (target, prop, args) => {
      const pool = Reflect.apply(target, prop, args);
      // Instrument Pool
      return wrapPool(pool, [registerDBRequestDuration]);
    }
  });

  /**
   * Create Proxy for the createPoolCluster where we will wrap the connection
   * to intercept the query
   *  */
  mysql.createPoolCluster = new Proxy(mysql.createPoolCluster, {
    apply: (target, prop, args) => {
      const poolCluster = Reflect.apply(target, prop, args);
      // Instrument poolCluster
      return wrapPoolCluster(poolCluster, [registerDBRequestDuration]);
    }
  });
};
