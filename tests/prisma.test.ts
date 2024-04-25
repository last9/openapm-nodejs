import express, { Express } from 'express';
import { test, expect, describe, beforeAll, afterAll, vi } from 'vitest';

import OpenAPM from '../src/OpenAPM';
import { addRoutes, makeRequest } from './utils';

describe('Prisma', () => {
  let openapm: OpenAPM;
  let app: Express;

  beforeAll(async () => {
    openapm = new OpenAPM({
      enableMetricsServer: false
    });
    openapm.instrument('express');

    app = express();

    app.get('/metrics', async (req, res) => {
      res.status(200).send(await openapm.getMetrics());
    });

    addRoutes(app);
    app.listen(3002);
  });

  afterAll(async () => {
    await openapm.shutdown();
  });

  test('prisma:installed - false', async () => {
    vi.doMock('@prisma/client', async () => {
      throw new Error('Cannot find module @prisma/client');
    });
    await makeRequest(app, '/api/10');
    await makeRequest(app, '/metrics');

    expect(openapm.simpleCache['prisma:installed']).toBe(false);
  });

  test('simpleCache', async () => {
    expect(openapm.simpleCache['prisma:installed']).toBe(false);
  });
});
