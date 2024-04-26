import { test, describe, beforeAll, expect } from 'vitest';
import { OpenAPM } from '../src/OpenAPM';

describe('Enabled Option', () => {
  let openapm: OpenAPM;
  beforeAll(async () => {
    openapm = new OpenAPM({
      enabled: false
    });
  });

  test('metricsServer', async () => {
    expect(openapm.metricsServer).toBeUndefined();
  });
  test('instrument', async () => {
    expect(openapm.instrument('express')).toBe(false);
  });
  test('getMetrics', async () => {
    expect(await openapm.getMetrics()).toBe('');
  });
});
