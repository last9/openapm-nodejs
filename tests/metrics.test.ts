import * as os from 'os';
import express, { Express } from 'express';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';
import request from 'supertest';
import { test, expect, describe, beforeAll, afterAll } from 'vitest';

import APM from '../src/APM';
import { addRoutes, sendTestRequests } from './utils';

describe('REDMiddleware', () => {
  const NUMBER_OF_REQUESTS = 300;
  let apm: APM;
  let app: Express;
  let parsedData: Array<Record<string, any>> = [];

  beforeAll(async () => {
    apm = new APM();
    app = express();
    app.use(apm.REDMiddleware);

    addRoutes(app);
    app.listen(3002);

    await sendTestRequests(app, NUMBER_OF_REQUESTS);
    const res = await request(apm.metricsServer).get('/metrics');
    parsedData = parsePrometheusTextFormat(res.text);
  });

  afterAll(async () => {
    apm.metricsServer?.close(() => {
      console.log('Closing the metrics server');
    });
  });

  test('Captures Counter Metrics', async () => {
    expect(
      parseInt(
        parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[0]
          .value ?? '0'
      )
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Captures Histogram Metrics', async () => {
    expect(
      Object.keys(
        parsedData?.find(
          (m) => m.name === 'http_requests_duration_milliseconds'
        )?.metrics[0].buckets
      ).length > 0
    ).toBe(true);
  });

  test('Masks the path', async () => {
    expect(
      parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[0]
        .labels.path
    ).toBe('/api/:id');
  });
});
