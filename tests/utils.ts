import request from 'supertest';
import express from 'express';
import type { Express } from 'express';

export const addRoutes = (app: Express) => {
  const router = express.Router();

  router.get('/:id', (req, res) => {
    const { id } = req.params;
    res.status(200).send(id);
  });
  app.use('/api/router/', router);
  app.get('/api/:id', (req, res) => {
    const { id } = req.params;
    res.status(200).send(id);
  });

  return app;
};

function getRandomId() {
  const min = 10;
  const max = 30;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export const sendTestRequests = async (app: Express, num: number) => {
  for (let index = 0; index < num; index++) {
    const id = getRandomId();
    try {
      // @ts-ignore
      const res = await request(app).get(`/api/${id}`);
    } catch (err) {
      throw new Error(err);
    }
  }
  const id = getRandomId();
  // @ts-ignore
  await request(app).get(`/api/router/${id}`);
};
