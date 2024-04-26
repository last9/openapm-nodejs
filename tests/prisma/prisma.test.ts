import express, { Express } from 'express';
import { test, expect, describe, beforeAll, afterAll, vi } from 'vitest';

import OpenAPM from '../../src/OpenAPM';
import { addRoutes, makeRequest } from '../utils';
import { Server } from 'http';

async function mock(mockedUri, stub) {
  const { Module } = await import('module');

  // @ts-ignore
  Module._load_original = Module._load;
  // @ts-ignore
  Module._load = (uri, parent) => {
    if (uri === mockedUri) return stub;
    // @ts-ignore
    return Module._load_original(uri, parent);
  };
}

async function unmock() {
  const { Module } = await import('module');

  // @ts-ignore
  Module._load = Module._load_original;

  // @ts-ignore
  delete Module._load_original;
}

describe('Prisma', () => {
  let openapm: OpenAPM;
  let app: Express;
  let server: Server;

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
    server = app.listen(3002);
  });

  afterAll(async () => {
    await openapm.shutdown();
    server.close();
  });

  test('prisma:installed - false', async () => {
    await makeRequest(app, '/api/10');
    await makeRequest(app, '/metrics');

    expect(openapm.simpleCache['prisma:installed']).toBe(false);
  });

  test('simpleCache', async () => {
    expect(openapm.simpleCache['prisma:installed']).toBe(false);
  });

  test('metrics', async () => {
    await unmock();
    await openapm.shutdown();
    openapm = new OpenAPM({
      enableMetricsServer: false
    });
    const res = await makeRequest(app, '/metrics');
    expect(res.text).toContain('prisma_pool_connections_busy');
  });
});
