import express, { Express } from 'express';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';
import request from 'supertest';
import { test, expect, describe, beforeAll, afterAll } from 'vitest';

import OpenAPM from '../src/OpenAPM';
import { addRoutes, makeRequest, sendTestRequests } from './utils';
import prom from 'prom-client';
import { writeFileSync } from 'fs';

describe('REDMiddleware', () => {
  const NUMBER_OF_REQUESTS = 300;
  const MEANING_OF_LIFE = 42;
  let openapm: OpenAPM;
  let app: Express;
  let parsedData: Array<Record<string, any>> = [];

  beforeAll(async () => {
    openapm = new OpenAPM({
      additionalLabels: ['id']
    });
    openapm.instrument('express');

    app = express();

    addRoutes(app);
    app.listen(3002);

    const out = await sendTestRequests(app, NUMBER_OF_REQUESTS);
    // @ts-ignore
    const res = await request(openapm.metricsServer).get('/metrics');
    parsedData = parsePrometheusTextFormat(res.text);
  });

  afterAll(async () => {
    openapm.metricsServer?.close(() => {
      console.log('Closing the metrics server');
      prom.register.clear();
    });
  });

  test;

  test('Captures Counter Metrics - App', async () => {
    expect(
      parseInt(
        parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[0]
          .value ?? '0'
      )
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Captures Custom Counter Metric - App', async () => {
    expect(
      parseInt(
        parsedData?.find((m) => m.name === 'custom_counter_total')?.metrics[0]
          .value ?? '0'
      )
    ).toBe(NUMBER_OF_REQUESTS);

    const labels = parsedData?.find((m) => m.name === 'custom_counter_total')
      ?.metrics[0].labels;

    // {
    //     service: 'express',
    //     environment: 'production',
    //     program: '@last9/openapm',
    //     version: '0.9.3-alpha',
    //     host: 'Adityas-MacBook-Pro-2.local',
    //     ip: '192.168.1.110'
    // }

    expect(labels.service).toBe('express');
    expect(labels.environment).toBe('production');
    expect(labels.program).toBe('@last9/openapm');
  });

  test('Captures Custom Gauge Metric - App', async () => {
    expect(
      parseInt(
        parsedData?.find((m) => m.name === 'custom_gauge')?.metrics[0].value ??
          '0'
      )
    ).toBe(MEANING_OF_LIFE);

    const labels = parsedData?.find((m) => m.name === 'custom_gauge')
      ?.metrics[0].labels;

    // {
    //     environment: 'production',
    //     program: '@last9/openapm',
    //     version: '0.9.3-alpha',
    //     host: 'Adityas-MacBook-Pro-2.local',
    //     ip: '192.168.1.110'
    // }

    expect(labels.environment).toBe('production');
    expect(labels.program).toBe('@last9/openapm');
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
    ).match(/api(?:\/router)?\/:id/);
  });

  test('Masks the path - Router', async () => {
    expect(
      parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[1]
        .labels.path
    ).match(/api(?:\/router)?\/:id/);
  });

  test('Captures Dynamic Labels', async () => {
    await makeRequest(app, '/api/labels/123');
    // @ts-ignore
    const res = await request(openapm.metricsServer).get('/metrics');
    parsedData = parsePrometheusTextFormat(res.text);

    expect(
      parsedData
        ?.find((m) => m.name === 'http_requests_total')
        ?.metrics?.find((m) => m.labels.path === '/api/labels/:id').labels.id
    ).toBe('123');
  });
});
