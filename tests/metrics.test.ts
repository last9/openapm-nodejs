import express, { Express } from 'express';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';
import request from 'supertest';
import { test, expect, describe, beforeAll, afterAll } from 'vitest';

import OpenAPM from '../src/OpenAPM';
import { addRoutes, sendTestRequests } from './utils';

describe('REDMiddleware', () => {
  const NUMBER_OF_REQUESTS = 300;
  let openapm: OpenAPM;
  let app: Express;
  let parsedData: Array<Record<string, any>> = [];

  beforeAll(async () => {
    app = express();
    openapm = new OpenAPM();
    app.use(openapm.REDMiddleware);

    addRoutes(app);
    app.listen(3002);

    const out = await sendTestRequests(app, NUMBER_OF_REQUESTS);
    const res = await request(openapm.metricsServer).get('/metrics');
    parsedData = parsePrometheusTextFormat(res.text);
  });

  afterAll(async () => {
    openapm.metricsServer?.close(() => {
      console.log('Closing the metrics server');
    });
  });

  test('Captures Counter Metrics - App', async () => {
    expect(
      parseInt(
        parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[0]
          .value ?? '0'
      )
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Captures Counter Metrics - Router', async () => {
    expect(
      parseInt(
        parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[1]
          .value ?? '0'
      )
    ).toBe(1);
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

  test('Masks the path - App', async () => {
    expect(
      parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[0]
        .labels.path
    ).toBe('/api/:id');
  });

  test('Masks the path - Router', async () => {
    expect(
      parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[1]
        .labels.path
    ).toBe('/api/router/:id');
  });
});
