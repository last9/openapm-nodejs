import { getAsyncLocalStorage } from './async-local-storage';

export const OpenAPMHttpRequestStoreKey = '__OPENAPM__httpRequestStore';

export type HTTPRequestStore = {
  labels: Record<string, string>;
};

export const getHTTPRequestStore = () => {
  return getAsyncLocalStorage<HTTPRequestStore>(
    OpenAPMHttpRequestStoreKey
  )?.getStore();
};

export const runInHTTPRequestStore = (fn: any) => {
  const asyncLocalStorage = getAsyncLocalStorage<HTTPRequestStore>(
    OpenAPMHttpRequestStoreKey
  );

  asyncLocalStorage.run(
    {
      labels: {}
    },
    () => {
      fn();
    }
  );
};

export const setOpenAPMLabels = (labels: Record<string, string>) => {
  const store = getHTTPRequestStore();
  if (typeof store !== 'undefined') {
    store.labels = labels;
  }
};
