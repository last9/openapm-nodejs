import { createAsyncLocalStorage } from './async-local-storage';

export type HTTPRequestStore = {
  labels: Record<string, string>;
};

const asyncLocalStorage = createAsyncLocalStorage<HTTPRequestStore>();

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
