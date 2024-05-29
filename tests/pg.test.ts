import type { Connection } from 'pg';
import { describe, beforeAll, afterAll, expect, test } from 'vitest';
import { Client } from 'pg';
import { OpenAPM, getMetricClient } from '../src/OpenAPM';

let connectionUri = 'postgres://root:password@localhost:5432/testdb';

describe('pg', () => {
  let client;
  let openapm: OpenAPM;

  const getMetrics = async () => {
    const client = getMetricClient();
    const parsedData = await client.register.getMetricsAsJSON();
    return parsedData;
  };

  beforeAll(async () => {
    openapm = new OpenAPM();
    openapm.instrument('pg');

    client = new Client(connectionUri);
    await client.connect();
  });

  afterAll(async () => {
    await openapm.shutdown();
    await client.end();
  });

  test('should connect to the database', async () => {
    const res = await client.query('SELECT NOW()');
    expect(res.rows[0].now).toBeDefined();
  });

  test('should capture metrics', async () => {
    const res = await client.query('SELECT NOW()');
    expect(res.rows[0].now).toBeDefined();
    const metrics = await getMetrics();

    const length = metrics.find(
      (m) => m.name === 'db_requests_duration_milliseconds'
    )?.values.length;

    expect(length).toBeDefined();
    expect(length).toBeGreaterThan(0);
  });

  test('masks the values in the query', async () => {
    await client.query('SELECT * FROM users WHERE id = 1');
    await client.query("SELECT * FROM users WHERE username = 'JohnDoe'");

    const metrics = await getMetrics();

    const histogram = metrics.find(
      (m) => m.name === 'db_requests_duration_milliseconds'
    );
    const values = histogram?.values;

    const numberQuery = values?.find(
      (v) => v.labels.query === 'SELECT * FROM users WHERE id = $1'
    );
    const stringQuery = values?.find(
      (v) => v.labels.query === 'SELECT * FROM users WHERE username = $1'
    );

    expect(numberQuery).toBeDefined();
    expect(stringQuery).toBeDefined();
  });
});
