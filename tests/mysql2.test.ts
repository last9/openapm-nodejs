import { describe, beforeAll, expect, test, vi, afterAll } from 'vitest';
import mysql2, { Connection, Pool, PoolCluster, PoolNamespace } from 'mysql2';
import { instrumentMySQL, symbols } from '../src/clients/mysql2';
import OpenAPM from '../src/OpenAPM';
import prom, { Histogram } from 'prom-client';

const sendTestRequest = async (conn: Connection | Pool, query: string) => {
  return new Promise((resolve) => {
    conn.query(query, () => {
      resolve(true);
    });
  });
};

const promisifyCreateConnection = async (): Promise<Connection> => {
  return new Promise((resolve) => {
    const conn = mysql2.createConnection(
      'mysql://express-app:password@127.0.0.1/express'
    );
    resolve(conn);
  });
};

const promisifyCreatePool = async (): Promise<Pool> => {
  return new Promise((resolve) => {
    const pool = mysql2.createPool(
      'mysql://express-app:password@127.0.0.1/express'
    );
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
  let openapm: OpenAPM, conn: Connection, pool: Pool, poolCluster: PoolCluster;

  beforeAll(async () => {
    openapm = new OpenAPM();
    instrumentMySQL(mysql2);

    conn = await promisifyCreateConnection();
    pool = await promisifyCreatePool();
    poolCluster = await promisifyCreatePoolCluster();
  });

  afterAll(() => {
    prom.register.clear();
    conn.end();
    openapm.metricsServer?.close(() => {
      console.log('Metrics server closing');
    });
  });

  test('Connection - Wrapped?', () => {
    expect(conn[symbols.WRAP_CONNECTION]).toBe(true);
  });

  test('Connection - query success?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(conn, 'SELECT * FROM USERS;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:express,query:SELECT * FROM USERS;,status:success'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Connection - query failure?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(conn, 'SELECT * FROM USER;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:express,query:SELECT * FROM USER;,status:failure'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Pool - Wrapped?', () => {
    expect(pool[symbols.WRAP_POOL]).toBe(true);
  });

  test('Pool - query success?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(pool, 'SELECT * FROM USERS;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:express,query:SELECT * FROM USERS;,status:success'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS * 2);
  });

  test('Pool - query failure?', async () => {
    const NUMBER_OF_REQUESTS = 5;
    for (let i = 0; i < NUMBER_OF_REQUESTS; i++) {
      await sendTestRequest(pool, 'SELECT * FROM USER;');
    }
    const histogram = prom.register.getSingleMetric(
      'db_requests_duration_milliseconds'
    ) as Histogram;

    expect(
      // @ts-ignore
      histogram.hashMap[
        'database_name:express,query:SELECT * FROM USERS;,status:success'
      ]?.count
    ).toBe(NUMBER_OF_REQUESTS * 2);
  });

  test('PoolCluster - Wrapped?', () => {
    expect(poolCluster[symbols.WRAP_POOL_CLUSTER]).toBe(true);
  });
});
