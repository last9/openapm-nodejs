import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import { setOpenAPMLabels } from '../src/async-local-storage.http';
import { metricClient } from '../src/OpenAPM';

export const addRoutes = (app: Express) => {
  const router = express.Router();
  const client = metricClient();
  const counter = new client.Counter({
    name: 'custom_counter',
    help: 'no. of times operation is called'
  });

  router.get('/:id', (req, res) => {
    const { id } = req.params;
    ``;
    // counter.inc();
    res.status(200).send(id);
  });
  app.use('/api/router/', router);

  app.get('/api/:id', (req, res) => {
    const { id } = req.params;
    counter.inc();
    res.status(200).send(id);
  });

  app.get('/api/labels/:id', (req, res) => {
    const { id } = req.params;
    setOpenAPMLabels({ id });
    res.status(200).send(id);
  });

  return app;
};

function getRandomId() {
  const min = 10;
  const max = 30;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export const makeRequest = async (app: Express, path: string) => {
  // @ts-ignore
  const res = await request(app).get(path);
  return res;
};

export const sendTestRequests = async (app: Express, num: number) => {
  for (let index = 0; index < num; index++) {
    const id = getRandomId();
    try {
      await makeRequest(app, `/api/${id}`);
    } catch (err) {
      throw new Error(err);
    }
  }
  const id = getRandomId();
  try {
    await makeRequest(app, `/api/router/${id}`);
  } catch (err) {
    throw new Error(err);
  }
};

export const sendTestRequestNextJS = async (app: Express, num: number) => {
  const endpoints = [
    '/',
    '/users',
    '/users/:id',
    '/app-apis',
    '/app-apis/:id',
    '/api/hello',
    '/api/auth/login',
    '/api/auth/register'
  ];

  const randomIndex = Math.floor(Math.random() * endpoints.length);
  let endpoint = endpoints[randomIndex];

  if (endpoint.includes(':id')) {
    const randomId = Math.floor(Math.random() * 100);
    endpoint = endpoint.replace(':id', randomId.toString());
  }

  await makeRequest(app, endpoint);
  await makeRequest(app, '/labels');
};
