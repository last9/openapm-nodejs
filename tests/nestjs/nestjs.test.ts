import { test, describe, beforeAll, afterAll, expect } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './src/app.module';
import { OpenAPM } from '../../src/OpenAPM';
import parsePrometheusTextFormat from 'parse-prometheus-text-format';

describe('Nest.js', () => {
  let app: INestApplication;
  let openapm: OpenAPM;

  async function bootstrap() {
    openapm = new OpenAPM({
      addtionalLabels: ['slug'],
    });
    openapm.instrument('nestjs');

    app = await NestFactory.create(AppModule);
    await app.listen(3000);
  }

  beforeAll(async () => {
    await bootstrap();
  });

  afterAll(async () => {
    await app.getHttpServer().close();
    await openapm.shutdown();
  });

  test('Dynamically set labels', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
    const res = await request(openapm.metricsServer).get('/metrics');

    const parsedData = parsePrometheusTextFormat(res.text);

    expect(
      parsedData?.find((m) => m.name === 'http_requests_total')?.metrics[0]
        .labels['slug'],
    ).toBe('custom-slug');
  });
});
