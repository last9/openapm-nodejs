const express = require('express');
const http = require('http');
const next = require('next');
const { parse } = require('url');
const { OpenAPM } = require('../../dist/src/index.js');

const openapm = new OpenAPM({
  metricsServerPort: 9098,
  additionalLabels: ['slug']
});

openapm.instrument('nextjs');

async function main() {
  const app = express();
  const server = http.createServer(app);

  // 'dev' is a boolean that indicates whether the app should run in development mode
  const dev = process.env.NODE_ENV !== 'production';
  const port = 3002;

  // 'dir' is a string that specifies the directory where the app is located
  const dir = './playground/next';
  const nextApp = next({
    dev,
    dir,
    customServer: true,
    httpServer: server,
    port
  });
  // openapm.instrument('nextjs', nextApp);
  const handle = nextApp.getRequestHandler();

  app.get('/metrics', async (_, res) => {
    const metrics = await openapm.getMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(metrics);
  });

  app.all('*', async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  // 'hostname' is a string that specifies the domain name of the server
  // For local development, this is typically 'localhost'
  const hostname = 'localhost';

  await nextApp.prepare();
  server.listen(port, hostname);
  server.on('error', async (err) => {
    console.error(err);
  });
  server.once('listening', async () => {});
}

main();
