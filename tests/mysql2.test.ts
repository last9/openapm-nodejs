import { describe, beforeAll, expect, test, afterAll } from 'vitest';
import mysql2, { Connection, Pool, PoolCluster } from 'mysql2';
import { instrumentMySQL, symbols } from '../src/clients/mysql2';
import prom, { Histogram } from 'prom-client';

const connectionUri = 'mysql://root:password@localhost:3306/test_db';

const sendTestRequest = async (conn: Connection | Pool, query: string) => {
  return new Promise((resolve) => {
    conn.query(query, () => {
      resolve(true);
    });
  });
};

const performUpMigration = async (conn: Connection) => {
  return new Promise((resolve, reject) => {
    conn.query(
      'CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255));',
      () => {
        resolve(true);
      }
    );
  });
};

const performDownMigration = (conn: Connection) => {
  return new Promise((resolve, reject) => {
    conn.query('DROP TABLE users;', () => {
      resolve(true);
    });
  });
};

const promisifyCreateConnection = async (): Promise<Connection> => {
  return new Promise((resolve) => {
    const conn = mysql2.createConnection(connectionUri);
    resolve(conn);
  });
};

const promisifyCreatePool = async (): Promise<Pool> => {
  return new Promise((resolve) => {
    const pool = mysql2.createPool(connectionUri);
    resolve(pool);
  });
};

const promisifyCreatePoolCluster = async (): Promise<PoolCluster> => {
  return new Promise((resolve) => {
    const poolCluster = mysql2.createPoolCluster();
    resolve(poolCluster);
  });
};

describe('mysql2', () => {
  let conn: Connection, pool: Pool, poolCluster: PoolCluster;

  beforeAll(async () => {
    instrumentMySQL(mysql2);

    conn = await promisifyCreateConnection();
    pool = await promisifyCreatePool();
    poolCluster = await promisifyCreatePoolCluster();

    await performUpMigration(conn);
  });

  afterAll(async () => {
    await performDownMigration(conn);
    conn.end();
    prom.register.clear();
  });

  test('Connection - Wrapped?', () => {
    expect(conn[symbols.WRAP_CONNECTION]).toBe(true);
  });

  test('Connection - query success?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(conn, 'SELECT * FROM users;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:test_db,query:SELECT * FROM users;,status:success,'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Connection - query failure?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(conn, 'SELECT * FROM user;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:test_db,query:SELECT * FROM user;,status:failure,'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Pool - Wrapped?', () => {
    expect(pool[symbols.WRAP_POOL]).toBe(true);
  });

  test('Pool - query success?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(pool, 'SELECT * FROM users;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:test_db,query:SELECT * FROM users;,status:success,'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS * 2);
  });

  test('Pool - query failure?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(pool, 'SELECT * FROM user;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:test_db,query:SELECT * FROM users;,status:success,'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS * 2);
  });

  test('PoolCluster - Wrapped?', () => {
    expect(poolCluster[symbols.WRAP_POOL_CLUSTER]).toBe(true);
  });
});
