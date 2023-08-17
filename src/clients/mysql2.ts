import promClient, { Histogram } from 'prom-client';
import type {
  Connection,
  ConnectionConfig,
  Pool,
  PoolCluster,
  Query,
  createConnection,
  createPool,
  createPoolCluster
} from 'mysql2';
import { maskValuesInSQLQuery } from '../utils';

interface Context {
  histogram: Histogram;
}

////// Constants ////////////////////////
export const symbols = {
  WRAP_CONNECTION: Symbol('WRAP_CONNECTION'),
  WRAP_POOL: Symbol('WRAP_POOL'),
  WRAP_GET_CONNECTION_CB: Symbol('WRAP_GET_CONNECTION_CB'),
  WRAP_POOL_CLUSTER: Symbol('WRAP_POOL_CLUSTER'),
  WRAP_POOL_CLUSTER_OF: Symbol('WRAP_POOL_CLUSTER_OF'),
  WRAP_QUERYABLE_CB: Symbol('WRAP_QUERYABLE_CB')
};

/////////////////////////////////////////

//// Utils /////////////////////////////

function getConnectionConfig(poolConfig: {
  connectionConfig: ConnectionConfig;
}): ConnectionConfig;
function getConnectionConfig(
  connectionConfig: ConnectionConfig
): ConnectionConfig;
function getConnectionConfig(config: any): ConnectionConfig {
  return config.connectionConfig ?? config;
}

//////////////////////////////////////

const registerResult = (
  result: Query,
  time: number,
  dbName: string,
  ctx: Context
) => {
  const maskedQuery = maskValuesInSQLQuery(result.sql);
  ctx.histogram.labels(dbName, maskedQuery.substring(0, 100)).observe(time);
};

/**
 *
 * @param fn queryable function that needs to be intercepted and instrumented
 * @param connectionConfig config for the connection/pool/pool cluster
 * @param metricRegisterFns array of functions that could be used to register metrics
 */
export function interceptQueryable(
  fn: Connection['query'],
  connectionConfig:
    | Connection['config']
    | Pool['config']
    | PoolCluster['config'],
  ctx: Context
): Connection['query'];
export function interceptQueryable(
  fn: Connection['execute'],
  connectionConfig:
    | Connection['config']
    | Pool['config']
    | PoolCluster['config'],
  ctx: Context
): Connection['execute'];
export function interceptQueryable(
  fn: any,
  connectionConfig:
    | Connection['config']
    | Pool['config']
    | PoolCluster['config'],
  ctx: Context
): any {
  return function (
    this: Connection['query'] | Connection['execute'],
    ...args: Parameters<Connection['query'] | Connection['execute']>
  ) {
    const end = ctx.histogram.startTimer({});
    const result = fn.apply(this, args) as ReturnType<Connection['query']>;
    end({
      database_name:
        getConnectionConfig(connectionConfig as any).database ?? '[db-name]',
      query: maskValuesInSQLQuery(result.sql).substring(0, 100)
    });

    return result;
  };
}

/**
 *  The function will get the prototype of the connection object and mutate the values of queryable
 * with the intercepted versions of them
 *
 * @param connection Connection object that contains queryables
 * @param metricRegisterFns
 * @returns Returns wrapped connection
 */
export const wrapConnection = (
  connection: Connection,
  ctx: {
    histogram: Histogram;
  }
) => {
  // Get ProtoType for the connection
  const connectionProto = Object.getPrototypeOf(connection);
  if (!connectionProto?.[symbols.WRAP_CONNECTION]) {
    /**
     * Intercept the query Function
     */
    connectionProto.query = interceptQueryable(
      connection.query,
      connection.config,
      ctx
    );
    /**
     * Intercept only if the execute is available
     */
    if (typeof connection.execute !== 'undefined') {
      connectionProto.execute = interceptQueryable(
        connection.execute,
        connection.config,
        ctx
      );
    }
    /**
     * This is to make sure we are only wrapping the connection once
     */
    connectionProto[symbols.WRAP_CONNECTION] = true;
  }
  return connection;
};

export const wrapPoolGetConnectionCB = (
  cb: Parameters<Pool['getConnection']>['0'],
  ctx: Context
): Parameters<Pool['getConnection']>['0'] => {
  return function (this: Parameters<Pool['getConnection']>['0'], ...args) {
    const [_, conn] = args;
    wrapConnection(conn, ctx);
    return cb.apply(this, args);
  };
};

export const wrapPoolGetConnection = (
  getConnectionFn: Pool['getConnection'],
  ctx: Context
) => {
  return function (
    this: Pool['getConnection'],
    ...args: Parameters<Pool['getConnection']>
  ) {
    let callbackFn = args[args.length - 1];
    const getConnectionFnProto = Object.getPrototypeOf(getConnectionFn);

    if (!getConnectionFnProto?.[symbols.WRAP_GET_CONNECTION_CB]) {
      callbackFn = wrapPoolGetConnectionCB(callbackFn, ctx);
      args[args.length - 1] = callbackFn;
      getConnectionFnProto[symbols.WRAP_GET_CONNECTION_CB] = true;
    }

    return getConnectionFn.apply(this, args);
  };
};

export const wrapPoolClusterOfFn = (
  of: PoolCluster['of'],
  poolClusterConfig: PoolCluster['config'],
  ctx: Context
) => {
  return function (
    this: PoolCluster['of'],
    ...args: Parameters<PoolCluster['of']>
  ) {
    const poolNamespace = of.apply(this, args);
    const poolNamespaceProto = Object.getPrototypeOf(poolNamespace);
    if (!poolNamespaceProto?.[symbols.WRAP_POOL_CLUSTER_OF]) {
      poolNamespaceProto.query = interceptQueryable(
        poolNamespace.query,
        poolClusterConfig,
        ctx
      );

      if (typeof poolNamespace.execute !== 'undefined') {
        poolNamespaceProto.execute = interceptQueryable(
          poolNamespace.execute,
          poolClusterConfig,
          ctx
        );
      }

      poolNamespaceProto.getConnection = wrapPoolGetConnection(
        poolNamespace['getConnection'],
        ctx
      );

      poolNamespaceProto[symbols.WRAP_POOL_CLUSTER_OF] = true;
    }
    return poolNamespace;
  };
};

/**
 * This function will get the proto type of the pool and intercept the queryable functions.
 * It will also wrap getConnection function of the pool so that it can wrap the callback function which consists of the db connection.
 * @param pool MySQL Pool
 * @param metricRegisterFns
 * @returns MySQL Pool
 */
export const wrapPool = (
  pool: Pool,
  ctx: {
    histogram: Histogram;
  }
) => {
  const poolProto = Object.getPrototypeOf(pool);
  if (!poolProto?.[symbols.WRAP_POOL]) {
    poolProto.query = interceptQueryable(pool.query, pool.config, ctx);

    if (typeof pool.execute !== 'undefined') {
      poolProto.execute = interceptQueryable(pool.execute, pool.config, ctx);
    }

    poolProto.getConnection = wrapPoolGetConnection(pool['getConnection'], ctx);
    poolProto[symbols.WRAP_POOL] = true;
  }

  return pool;
};

export const wrapPoolCluster = (poolCluster: PoolCluster, ctx: Context) => {
  let poolClusterProto = Object.getPrototypeOf(poolCluster);
  if (!poolClusterProto?.[symbols.WRAP_POOL_CLUSTER]) {
    poolClusterProto.of = wrapPoolClusterOfFn(
      poolCluster.of,
      poolCluster.config,
      ctx
    );
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
    labelNames: ['database_name', 'query'],
    buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
  });

  /**
   * Create Proxy for the createConnection where we will wrap the connection
   * to intercept the query
   *  */
  mysql.createConnection = new Proxy(mysql.createConnection, {
    apply: (target, prop, args) => {
      const connection = Reflect.apply(target, prop, args);
      // Instrument Connection
      return wrapConnection(connection, {
        histogram
      });
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
      return wrapPool(pool, {
        histogram
      });
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
      return wrapPoolCluster(poolCluster, {
        histogram
      });
    }
  });
};
