import promClient from 'prom-client';

export function getMetricClient() {
  return promClient;
}
