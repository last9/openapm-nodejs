import request from 'supertest';
import { Express } from 'express';

export const addRoutes = (app: Express) => {
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
  const out: Array<Record<string, number>> = [];
  for (let index = 0; index < num; index++) {
    const id = getRandomId();
    try {
      const res = await request(app).get(`/api/${id}`);
      out.push({ [id]: res.status });
    } catch (err) {
      throw new Error(err);
    }
  }

  return out;
};
