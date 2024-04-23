import { Server } from 'http';
import next from 'next';
import express from 'express';
import request from 'supertest';
import { describe, afterAll, beforeAll, test, expect } from 'vitest';
import OpenAPM from '../../src/OpenAPM';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';
import { resolve } from 'path';
import { sendTestRequestNextJS, sendTestRequests } from '../utils';

describe('Next.js', () => {
  let openapm: OpenAPM;
  let server: Server;
  let parsedData: Array<Record<string, any>> = [];

  beforeAll(async () => {
    openapm = new OpenAPM({
      enableMetricsServer: false
    });

    openapm.instrument('nextjs');

    const expressApp = express();
    const app = next({
      dev: false,
      customServer: false,
      httpServer: server,
      dir: resolve(__dirname),
      conf: {}
    });

    expressApp.get('/metrics', async (_, res) => {
      let metrics = await openapm.getMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.end(metrics);
    });

    expressApp.all('*', (req, res) => {
      return app.getRequestHandler()(req, res);
    });

    await app.prepare();
    server = expressApp.listen(3003);

    await sendTestRequestNextJS(expressApp, 3);
    const res = await request(expressApp).get('/metrics');
    parsedData = parsePrometheusTextFormat(res.text);
  });

  afterAll(() => {
    server?.close();
  });

  test('Metrics are captured', async () => {
    expect(parsedData).toBeDefined();
  });

  test('Captures Counter Metrics', async () => {
    const counterMetrics = parsedData?.find(
      (m) => m.name === 'http_requests_total'
    )?.metrics;
    expect(counterMetrics.length > 0).toBe(true);
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
});
