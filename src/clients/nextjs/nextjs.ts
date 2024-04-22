import type NextNodeServer from 'next/dist/server/next-server';
import chokidar from 'chokidar';
import type { Counter, Histogram } from 'prom-client';
import { wrap } from '../../shimmer';
import { loadManifest } from 'next/dist/server/load-manifest';
import { join } from 'path';
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex';
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher';

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

      for (const [key, _] of Object.entries(appPathsManifest)) {
        const path = key.replace(/\/(page|not-found|layout|loading|head)$/, '');
        const reg = getRouteRegex(path);
        const matcher = getRouteMatcher(reg);

        PATHS_CACHE.value.add({
          route: path,
          matcher,
          re: reg.re
        });
      }

      for (const key of Object.keys(pagesManifest)) {
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
    counter: Counter;
    histogram: Histogram;
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

    ctx.counter
      .labels(
        parsedPath !== '' ? parsedPath : '/',
        req.method ?? 'GET',
        res.statusCode?.toString() ?? '500'
      )
      .inc();

    ctx.histogram
      .labels(
        parsedPath !== '' ? parsedPath : '/',
        req.method ?? 'GET',
        res.statusCode?.toString() ?? '500'
      )
      .observe(duration);

    return result;
  };
};

const getPagesCache = () => {
  // const dotNext = join(process.cwd(), '.next');
  const pagesCache = new Set<{
    route: string;
    re: RegExp;
    matcher: (pathname: string | null | undefined) =>
      | false
      | {
          [param: string]: any;
        };
  }>();

  try {
    const appManifest = loadManifest(
      join(DOT_NEXT, APP_PATHS_MANIFEST),
      false
    ) as {
      pages: Record<string, Record<string, string>>;
    };
    const pagesManifest = loadManifest(
      join(DOT_NEXT, PAGES_MANIFEST),
      false
    ) as {
      pages: Record<string, Record<string, string>>;
    };

    for (const [key, _] of Object.entries(appManifest)) {
      const path = key.replace(/\/(page|not-found|layout|loading|head)$/, '');
      const reg = getRouteRegex(path);
      const matcher = getRouteMatcher(reg);

      pagesCache.add({
        route: path,
        matcher,
        re: reg.re
      });
    }

    for (const [key, _] of Object.entries(pagesManifest)) {
      const reg = getRouteRegex(key);
      const matcher = getRouteMatcher(reg);

      pagesCache.add({
        route: key,
        matcher,
        re: reg.re
      });
    }
  } catch (e) {}

  return {
    pagesCache,
    update: () => {
      getPagesCache();
    }
  };
};

export const instrumentNextjs = (
  nextServer: typeof NextNodeServer,
  { counter, histogram }: { counter?: Counter; histogram?: Histogram }
) => {
  if (!counter || !histogram) {
    throw new Error(
      'counter and histogram are required. Make sure you are using openmetrics mode.'
    );
  }

  PATHS_CACHE.setValue();
  PATHS_CACHE.keepUpdated();
  const getParameterizedRoute = (route: string) => {
    for (const page of PATHS_CACHE.value) {
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
