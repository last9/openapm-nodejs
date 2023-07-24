import {
  Connection,
  createConnection,
  createPool,
  createPoolCluster
} from 'mysql2';

function interceptQueryable(fn: Connection['query']): Connection['query'];
function interceptQueryable(fn: Connection['execute']): Connection['execute'];
function interceptQueryable(fn: any): any {
  return function (
    this: Connection['query'] | Connection['execute'],
    ...args: Parameters<Connection['query'] | Connection['execute']>
  ) {
    const result = fn.apply(this, args);
    // Instrumentaion code goes here
    console.log(args);
    return result;
  };
}

const wrapConnection = (connection: Connection) => {
  const connectionProto = Object.getPrototypeOf(connection);
  connectionProto.query = interceptQueryable(connection.query);
  if (typeof connection.execute !== 'undefined') {
    connectionProto.execute = interceptQueryable(connection.execute);
  }
  return connection;
};

export const instrumentMySQL = (mysql: {
  createConnection: typeof createConnection;
  createPool: typeof createPool;
  createPoolCluster: typeof createPoolCluster;
}) => {
  mysql.createConnection = new Proxy(mysql.createConnection, {
    apply: (target, prop, args) => {
      const connection = Reflect.apply(target, prop, args);
      return wrapConnection(connection);
    }
  });
};
