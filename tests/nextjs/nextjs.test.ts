import { Server } from 'http';
import next from 'next';
import express from 'express';
import request from 'supertest';
import { describe, afterAll, beforeAll, test, expect } from 'vitest';
import OpenAPM from '../../src/OpenAPM';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';
import { resolve } from 'path';
import { makeRequest } from '../utils';
import { chromium } from 'playwright';

describe('Next.js', () => {
  let openapm: OpenAPM;
  let server: Server;
  let parsedData: Array<Record<string, any>>;
  let expressApp: express.Express;

  beforeAll(async () => {
    openapm = new OpenAPM({
      enableMetricsServer: false,
      additionalLabels: ['slug']
    });
    openapm.instrument('nextjs');

    const app = next({
      customServer: false,
      httpServer: server,
      dir: resolve(__dirname),
      conf: {}
    });

    expressApp = express();
    expressApp.get('/metrics', async (_, res) => {
      let metrics = await openapm.getMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.end(metrics);
    });

    const handler = app.getRequestHandler();

    expressApp.all('*', async (req, res) => {
      return await handler(req, res);
    });

    await app.prepare();
    server = expressApp.listen(3003);
  });

  afterAll(async () => {
    await openapm.shutdown();
    server?.close();
  });

  test('App router: Page Route', async () => {
    const res = await makeRequest(expressApp, '/');
    expect(res.statusCode).toBe(200);
  });

  test('App router: Route does not exists', async () => {
    const res = await makeRequest(expressApp, '/non-existent-route');
    expect(res.statusCode).toBe(404);
  });

  test('App router: API Route (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)', async () => {
    const route = '/app-apis';
    let res = await request(expressApp).get(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).post(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).put(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).delete(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).patch(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).head(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).options(route);
    expect(res.statusCode).toBe(200);
  });

  test('Page router: Page Route', async () => {
    const res = await makeRequest(expressApp, '/about');
    expect(res.statusCode).toBe(200);
  });

  test('Page router: API Route (GET, POST, PUT, DELETE, PATCH, HEAD)', async () => {
    const route = '/api/hello';
    let res = await request(expressApp).get(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).post(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).put(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).delete(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).head(route);
    expect(res.statusCode).toBe(200);

    res = await request(expressApp).patch(route);
    expect(res.statusCode).toBe(200);
  });

  test('Metrics are captured', async () => {
    parsedData = parsePrometheusTextFormat(
      (await makeRequest(expressApp, '/metrics')).text
    );
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

  test('App router route paths masked', async () => {
    await makeRequest(expressApp, '/app-apis/123');
    parsedData = parsePrometheusTextFormat(
      (await makeRequest(expressApp, '/metrics')).text
    );
    expect(
      parsedData
        ?.find((m) => m.name === 'http_requests_total')
        ?.metrics.find((m) => m.labels.path === '/app-apis/[id]')
    ).toBeDefined();
  });

  test('App router page paths masked', async () => {
    await makeRequest(expressApp, '/users/123');
    parsedData = parsePrometheusTextFormat(
      (await makeRequest(expressApp, '/metrics')).text
    );
    expect(
      parsedData
        ?.find((m) => m.name === 'http_requests_total')
        ?.metrics.find((m) => m.labels.path === '/users/[id]')
    ).toBeDefined();
  });

  test('Page router page paths masked', async () => {
    await makeRequest(expressApp, '/blog/123');
    parsedData = parsePrometheusTextFormat(
      (await makeRequest(expressApp, '/metrics')).text
    );
    expect(
      parsedData
        ?.find((m) => m.name === 'http_requests_total')
        ?.metrics.find((m) => m.labels.path === '/blog/[id]')
    ).toBeDefined();
  });

  test('Page router route paths masked', async () => {
    await makeRequest(expressApp, '/api/auth/login');
    parsedData = parsePrometheusTextFormat(
      (await makeRequest(expressApp, '/metrics')).text
    );
    expect(
      parsedData
        ?.find((m) => m.name === 'http_requests_total')
        ?.metrics.find((m) => m.labels.path === '/api/auth/[...nextAuth]')
    ).toBeDefined();
  });

  test('Static files should not be captured in metrics', async () => {
    const res = await makeRequest(expressApp, '/about');
    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.setContent(res.text);
    console.log(res.text);

    const elements = await page.$$('script');

    for (let el of elements) {
      const src = await el.getAttribute('src');
      if (src) {
        await makeRequest(expressApp, src);
      }
    }
    parsedData = parsePrometheusTextFormat(
      (await makeRequest(expressApp, '/metrics')).text
    );

    expect(
      parsedData
        ?.find((m) => m.name === 'http_requests_total')
        ?.metrics.find((m) => m.labels.path.endsWith('.js'))
    ).toBeUndefined();
  });
});

/**
 * Test Cases:
 * - [x] App router correctly routes requests page routes
 * - [x] Next gives 404 for non-existent routes
 * - [x] App router correctly routes requests route routes (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
 * - [x] Page router correctly routes requests to the react components
 * - [x] Page router correctly routes requests to the API routes (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
 * - [x] Metrics are captured
 * - [x] Captures Counter Metrics
 * - [x] Captures Histogram Metrics
 * - [x] App router route paths getting masked correctly
 * - [x] App router page paths getting masked correctly
 * - [x] Page router page paths getting masked correctly
 * - [x] Page router route paths getting masked correctly
 * - [ ] Static files should not be captured in metrics
 */
