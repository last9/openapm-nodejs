import express, { Express } from 'express';
import { test, expect, describe, beforeAll, afterAll, vi } from 'vitest';

import OpenAPM from '../../src/OpenAPM';
import { addRoutes, makeRequest } from '../utils';
import { Server } from 'http';

class OpenAPMExtended extends OpenAPM {
  public simpleCache: Record<string, any>;

  constructor() {
    super({
      enableMetricsServer: false
    });
    this.simpleCache = {};
  }

  clearSimpleCache() {
    this.simpleCache = {};
  }
}

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

  vi.hoisted(async () => {
    await mock('@prisma/client', {
      PrismaClient: class PrismaClient {
        constructor() {
          throw new Error('Cannot find module "@prisma/client"');
        }
      }
    });
  });

  beforeAll(async () => {
    openapm = new OpenAPMExtended();
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
    (openapm as OpenAPMExtended).clearSimpleCache();
    await makeRequest(app, '/metrics');
    expect(openapm.simpleCache['prisma:installed']).toBe(true);
  });
});
