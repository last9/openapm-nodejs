import { Server } from 'http';
import next from 'next';
import express from 'express';
import { parse } from 'url';
import request from 'supertest';
import { describe, afterAll, beforeAll, test, expect } from 'vitest';
import OpenAPM from '../../src/OpenAPM';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';

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
    const app = next({ dev: true, httpServer: server, dir: './nextjs' });

    expressApp.get('/metrics', async (_, res) => {
      let metrics = await openapm.getMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.end(metrics);
    });

    expressApp.all('*', (req, res) => {
      const parsedUrl = parse(req.url, true);
      return app.getRequestHandler()(req, res, parsedUrl);
    });

    // await app.prepare();
    server = expressApp.listen(3002);

    const res = await request(expressApp).get('/metrics');
    parsedData = parsePrometheusTextFormat(res.text);
  });

  afterAll(() => {
    server?.close();
  });

  test('Metrics are captured', async () => {
    expect(parsedData).toBeDefined();
  });
});
