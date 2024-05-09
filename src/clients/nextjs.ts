import type NextNodeServer from 'next/dist/server/next-server';
import prom, { Counter, Histogram } from 'prom-client';
import chokidar from 'chokidar';
import { wrap } from '../shimmer';
import { loadManifest } from 'next/dist/server/load-manifest';
import { join } from 'path';
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex';
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher';
import OpenAPM from '../OpenAPM';
import { getHTTPRequestStore } from '../async-local-storage.http';

const DOT_NEXT = join(process.cwd(), '.next');

const PAGES_MANIFEST = 'server/pages-manifest.json';
const APP_PATHS_MANIFEST = 'server/app-paths-manifest.json';

const PATHS_CACHE = {
  value: new Set<{
    route: string;
    re: RegExp;
    matcher: (pathname: string | null | undefined) =>
      | false
      | {
          [param: string]: any;
        };
  }>(),
  setValue: async () => {
    try {
      const pagesManifest = (await loadManifest(
        join(DOT_NEXT, PAGES_MANIFEST),
        false
      )) as Record<string, string>;
      const appPathsManifest = (await loadManifest(
        join(DOT_NEXT, APP_PATHS_MANIFEST),
        false
      )) as Record<string, string>;

      const appPathsKeys = Object.keys(appPathsManifest);
      for (let i = 0; i < appPathsKeys.length; i++) {
        const key = appPathsKeys[i];
        const path = key.replace(
          /\/(page|not-found|layout|loading|head|route)$/,
          ''
        );
        const reg = getRouteRegex(path);
        const matcher = getRouteMatcher(reg);

        PATHS_CACHE.value.add({
          route: path,
          matcher,
          re: reg.re
        });
      }

      const keys = Object.keys(pagesManifest);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const reg = getRouteRegex(key);
        const matcher = getRouteMatcher(reg);

        PATHS_CACHE.value.add({
          route: key,
          matcher,
          re: reg.re
        });
      }
    } catch (e) {}
  },
  keepUpdated: () => {
    const watcher = chokidar.watch(DOT_NEXT, {
      ignoreInitial: true
    });

    watcher.on('all', () => {
      PATHS_CACHE.setValue();
    });
    return watcher;
  }
};

const parsedPathname = (url: string) => {
  return url.split('?')[0];
};

const wrappedHandler = (
  handler: ReturnType<NextNodeServer['getRequestHandler']>,
  ctx: {
    getParameterizedRoute: (route: string) => string;
    counter?: Counter;
    histogram?: Histogram;
  }
) => {
  return async function (
    ...args: Parameters<ReturnType<NextNodeServer['getRequestHandler']>>
  ) {
    const [req, res] = args;
    const start = process.hrtime.bigint();

    const result = handler(...args);
    if (result instanceof Promise) {
      await result;
    }
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6;
    const parsedPath = ctx.getParameterizedRoute(
      parsedPathname(req.url ?? '/')
    );

    const store = getHTTPRequestStore();
    ctx.counter?.inc({
      path: parsedPath !== '' ? parsedPath : '/',
      method: req.method ?? 'GET',
      status: res.statusCode?.toString() ?? '500',
      ...(store?.labels ?? {})
    });

    ctx.histogram?.observe(
      {
        path: parsedPath !== '' ? parsedPath : '/',
        method: req.method ?? 'GET',
        status: res.statusCode?.toString() ?? '500',
        ...(store?.labels ?? {})
      },
      duration
    );

    return result;
  };
};

export const instrumentNextjs = (
  nextServer: typeof NextNodeServer,
  { counter, histogram }: { counter?: Counter; histogram?: Histogram },
  openapm: OpenAPM
) => {
  const ctx = {
    counter,
    histogram
  };

  if (typeof ctx.counter === 'undefined') {
    ctx.counter = new prom.Counter(openapm.requestsCounterConfig);
  }

  if (typeof ctx.histogram === 'undefined') {
    ctx.histogram = new prom.Histogram(openapm.requestDurationHistogramConfig);
  }

  PATHS_CACHE.setValue();
  PATHS_CACHE.keepUpdated();
  const getParameterizedRoute = (route: string) => {
    const values = Array.from(PATHS_CACHE.value);
    for (let i = 0; i < values.length; i++) {
      const page = values[i];
      if (page.matcher(route) !== false) {
        return page.route;
      }
    }

    return route;
  };

  wrap(nextServer.prototype, 'getRequestHandler', function (original) {
    return function (
      this: NextNodeServer['getRequestHandler'],
      ...args: Parameters<NextNodeServer['getRequestHandler']>
    ) {
      const handler = original.apply(this, args) as ReturnType<
        NextNodeServer['getRequestHandler']
      >;
      return wrappedHandler(handler, {
        getParameterizedRoute,
        counter,
        histogram
      });
    };
  });
};
