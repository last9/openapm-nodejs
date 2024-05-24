import { AsyncLocalStorage } from 'async_hooks';

export type HTTPRequestStore = {
  labels: Record<string, string>;
};

export const asyncLocalStorage = new AsyncLocalStorage<HTTPRequestStore>();

export const getHTTPRequestStore = () => {
  return asyncLocalStorage.getStore();
};

export const runInHTTPRequestStore = <R>(fn: any) => {
  return asyncLocalStorage.run<R>(
    {
      labels: {}
    },
    fn
  );
};

export const setOpenAPMLabels = (labels: Record<string, string>) => {
  const store = getHTTPRequestStore();
  if (typeof store !== 'undefined') {
    store.labels = {
      ...store.labels,
      ...labels
    };
  }
};
