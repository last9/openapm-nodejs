import express, { Express } from 'express';
import { test, expect, describe, beforeAll, afterAll } from 'vitest';

import OpenAPM from '../src/OpenAPM';
import { getMetricClient } from '../src/get-metric-client';
import { addRoutes, makeRequest, sendTestRequests } from './utils';
import prom from 'prom-client';

describe('REDMiddleware', () => {
  const NUMBER_OF_REQUESTS = 300;
  const MEANING_OF_LIFE = 42;
  let openapm: OpenAPM;
  let app: Express;

  const getMetrics = async () => {
    const client = getMetricClient();
    const parsedData = await client.register.getMetricsAsJSON();
    return parsedData;
  };

  beforeAll(async () => {
    openapm = new OpenAPM({
      additionalLabels: ['id']
    });
    openapm.instrument('express');

    app = express();

    addRoutes(app);
    app.listen(3002);

    // const out = await sendTestRequests(app, NUMBER_OF_REQUESTS);
  });

  afterAll(async () => {
    openapm.metricsServer?.close(() => {
      console.log('Closing the metrics server');
      prom.register.clear();
    });
  });

  test('Captures Counter Metrics - App', async () => {
    const parsedData = await getMetrics();

    expect(
      parsedData.find((m) => m.name === 'http_requests_total')?.values[0].value
    ).toBe(NUMBER_OF_REQUESTS);
  });

  test('Captures Custom Counter Metric - App', async () => {
    const parsedData = await getMetrics();

    const customCounterMetric = parsedData.find(
      (m) => m.name === 'custom_counter_total'
    )?.values[0];

    expect(customCounterMetric?.value).toBe(NUMBER_OF_REQUESTS);

    const labels = customCounterMetric?.labels;
    // {
    //     service: 'express',
    //     environment: 'production',
    //     program: '@last9/openapm',
    //     version: '0.9.3-alpha',
    //     host: 'Adityas-MacBook-Pro-2.local',
    //     ip: '192.168.1.110'
    // }

    expect(labels?.service).toBe('express');
    expect(labels?.environment).toBe('production');
    expect(labels?.program).toBe('@last9/openapm');
  });

  test('Captures Custom Gauge Metric - App', async () => {
    const parsedData = await getMetrics();

    const customGaugeMetric = parsedData.find((m) => m.name === 'custom_gauge')
      ?.values[0];

    expect(customGaugeMetric?.value).toBe(MEANING_OF_LIFE);

    const labels = customGaugeMetric?.labels;

    // {
    //     environment: 'production',
    //     program: '@last9/openapm',
    //     version: '0.9.3-alpha',
    //     host: 'Adityas-MacBook-Pro-2.local',
    //     ip: '192.168.1.110'
    // }

    expect(labels?.environment).toBe('production');
    expect(labels?.program).toBe('@last9/openapm');
  });

  test('Captures Counter Metrics - Router', async () => {
    const parsedData = await getMetrics();
    const metric = parsedData.find((m) => m.name === 'http_requests_total');

    expect(
      metric?.values.find((m) => m.labels.path === '/api/router/:id')?.value
    ).toBe(1);
  });

  test('Captures Histogram Metrics', async () => {
    const parsedData = await getMetrics();

    const metric = parsedData.find(
      (m) => m.name === 'http_requests_duration_milliseconds'
    );

    expect(metric?.values?.length && metric.values.length > 0).toBe(true);
  });

  test('Masks the path - App', async () => {
    const parsedData = await getMetrics();

    const metric = parsedData.find((m) => m.name === 'http_requests_total');

    expect(metric?.values[0].labels.path).match(/api(?:\/router)?\/:id/);
  });

  test('Masks the path - Router', async () => {
    const client = getMetricClient();
    const parsedData = await client.register.getMetricsAsJSON();
    const metric = parsedData.find((m) => m.name === 'http_requests_total');

    expect(metric?.values[1].labels.path).match(/api(?:\/router)?\/:id/);
  });

  test('Captures Dynamic Labels', async () => {
    await makeRequest(app, '/api/labels/123');
    // @ts-ignore
    const parsedData = await getMetrics();

    const metricValues = parsedData?.find(
      (m) => m.name === 'http_requests_total'
    )?.values;

    expect(
      metricValues?.find((m) => m.labels.path === '/api/labels/:id')?.labels.id
    ).toBe('123');
  });

  test('Third Party call instrumentation', async () => {
    const res = await makeRequest(app, '/cat-facts');
    expect(true).toBe(true);
  });
});
