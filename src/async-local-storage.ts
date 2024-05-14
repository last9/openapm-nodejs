import { AsyncLocalStorage } from 'node:async_hooks';

export const storeAsyncLocalStorageInGlobalThis = <T>(
  key: string,
  asyncLocalStorage: AsyncLocalStorage<T>
) => {
  (globalThis as any)[key] = asyncLocalStorage;
};

export const createAsyncLocalStorage = <T>() => {
  return new AsyncLocalStorage<T>();
};
