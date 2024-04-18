import type NextNodeServer from 'next/dist/server/next-server';
import prom, { Counter, Histogram } from 'prom-client';
import { wrap } from '../../shimmer';
import { loadManifest } from 'next/dist/server/load-manifest';
import { join } from 'path';
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex';
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher';

const PAGES_MANIFEST = 'server/pages-manifest.json';
const APP_PATHS_MANIFEST = 'server/app-paths-manifest.json';

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

    ctx.counter
      .labels(
        ctx.getParameterizedRoute(parsedPathname(req.url ?? '/')),
        req.method ?? 'GET',
        res.statusCode?.toString() ?? '500'
      )
      .inc();

    ctx.histogram
      .labels(
        ctx.getParameterizedRoute(parsedPathname(req.url ?? '/')),
        req.method ?? 'GET',
        res.statusCode?.toString() ?? '500'
      )
      .observe(duration);

    return result;
  };
};

const getPagesCache = () => {
  const dotNext = join(process.cwd(), '.next');
  const pagesCache = new Set<{
    route: string;
    re: RegExp;
    matcher: (pathname: string | null | undefined) =>
      | false
      | {
          [param: string]: any;
        };
  }>();
  const appManifest = loadManifest(join(dotNext, APP_PATHS_MANIFEST), true) as {
    pages: Record<string, Record<string, string>>;
  };
  const pagesManifest = loadManifest(join(dotNext, PAGES_MANIFEST), true) as {
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

  return {
    pagesCache,
    update: () => {
      getPagesCache();
    }
  };
};

export const instrumentNextjs = (nextServer: typeof NextNodeServer) => {
  const { pagesCache, update } = getPagesCache();

  const getParameterizedRoute = (route: string) => {
    for (const page of pagesCache) {
      if (page.matcher(route) !== false) {
        return page.route;
      }
    }

    update();

    for (const page of pagesCache) {
      if (page.matcher(route)) {
        return page.route;
      }
    }
    return route;
  };

  const counter = new prom.Counter({
    name: 'nextjs_http_request_total',
    help: 'Total number of requests to nextjs app.',
    labelNames: ['path', 'method', 'status']
  });

  const histogram = new prom.Histogram({
    name: 'nextjs_http_request_duration_milliseconds',
    help: 'Duration of requests to nextjs app.',
    labelNames: ['path', 'method', 'status'],
    buckets: prom.exponentialBuckets(0.25, 1.5, 31)
  });

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
