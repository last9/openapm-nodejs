import * as os from 'os';
import http from 'http';
import ResponseTime from 'response-time';
import promClient from 'prom-client';

import type {
  Counter,
  CounterConfiguration,
  Histogram,
  HistogramConfiguration
} from 'prom-client';
import type { Request } from 'express';
import type { IncomingMessage, ServerResponse, Server } from 'http';

import {
  getHostIpAddress,
  getPackageJson,
  getParsedPathname,
  getSanitizedPath
} from './utils';
import { instrumentMySQL } from './clients/mysql2';

export interface OpenAPMOptions {
  /** Route where the metrics will be exposed
   * @default "/metrics"
   */
  path?: string;
  /** Port for the metrics server
   * @default 9097
   */
  metricsServerPort?: number;
  /** Application environment
   * @default 'production'
   */
  environment?: string;
  /** Any default labels you want to include */
  defaultLabels?: Record<string, string>;
  /** Accepts configuration for Prometheus Counter  */
  requestsCounterConfig?: CounterConfiguration<string>;
  /** Accepts configuration for Prometheus Histogram */
  requestDurationHistogramConfig?: HistogramConfiguration<string>;
  /** Extract Tenant via URL path, subdomain, header */
  extractTenantVia?: string;
  /** Tenant label: Which URL path param should be extracted as tenant */
  tenantLabel?: string;
}

export type SupportedModules = 'mysql';

const packageJson = getPackageJson();

export class OpenAPM {
  private path: string;
  private metricsServerPort: number;
  private environment: string;
  private defaultLabels?: Record<string, string>;
  private requestsCounterConfig: CounterConfiguration<string>;
  private requestDurationHistogramConfig: HistogramConfiguration<string>;
  private extractTenantVia?: string;
  private tenantLabel?: string;

  private requestsCounter?: Counter;
  private requestsDurationHistogram?: Histogram;
  public metricsServer?: Server;

  constructor(options?: OpenAPMOptions) {
    // Initializing all the options
    this.path = options?.path ?? '/metrics';
    this.metricsServerPort = options?.metricsServerPort ?? 9097;
    this.environment = options?.environment ?? 'production';
    this.defaultLabels = options?.defaultLabels;
    this.requestsCounterConfig = options?.requestsCounterConfig ?? {
      name: 'http_requests_total',
      help: 'Total number of requests',
      labelNames: ['path', 'method', 'status', 'tenant']
    };
    this.requestDurationHistogramConfig =
      options?.requestDurationHistogramConfig || {
        name: 'http_requests_duration_milliseconds',
        help: 'Duration of HTTP requests in milliseconds',
        labelNames: ['path', 'method', 'status', 'tenant'],
        buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
      };

    // Default via URL as of now. Later add support for subdomain and request header
    this.extractTenantVia = 'url';
    this.tenantLabel = options?.tenantLabel;

    this.initiateMetricsRoute();
    this.initiatePromClient();
  }

  private initiatePromClient = () => {
    promClient.register.setDefaultLabels({
      environment: this.environment,
      program: packageJson.name,
      version: packageJson.version,
      host: os.hostname(),
      ip: getHostIpAddress(),
      ...this.defaultLabels
    });

    promClient.collectDefaultMetrics({
      gcDurationBuckets: this.requestDurationHistogramConfig.buckets
    });

    // Initiate the Counter for the requests
    this.requestsCounter = new promClient.Counter(this.requestsCounterConfig);
    // Initiate the Duration Histogram for the requests
    this.requestsDurationHistogram = new promClient.Histogram(
      this.requestDurationHistogramConfig
    );
  };

  private gracefullyShutdownMetricsServer = () => {
    this.metricsServer?.close((err) => {
      promClient.register.clear();
      console.log('Shutting down metrics server.');
      if (err) {
        console.error('Error while shutting down the metrics server:', err);
        process.exit(1);
      } else {
        console.log('Metrics server shut down gracefully.');
        process.exit(0);
      }
    });
  };

  private initiateMetricsRoute = () => {
    // Creating native http server
    this.metricsServer = http.createServer(async (req, res) => {
      // Sanitize the path
      const path = getSanitizedPath(req.url ?? '/');
      if (path === this.path && req.method === 'GET') {
        res.setHeader('Content-Type', promClient.register.contentType);
        return res.end(await promClient.register.metrics());
      } else {
        res.statusCode = 404;
        res.end('404 Not found');
      }
    });

    // Start listening at the given port defaults to 9097
    this.metricsServer?.listen(this.metricsServerPort, () => {
      console.log(`Metrics server running at ${this.metricsServerPort}`);
    });
    process.on('SIGINT', this.gracefullyShutdownMetricsServer);
    process.on('SIGTERM', this.gracefullyShutdownMetricsServer);
  };

  // Middleware Function, which is essentially the response-time middleware with a callback that captures the
  // metrics
  public REDMiddleware = ResponseTime(
    (
      req: IncomingMessage & Request,
      res: ServerResponse<IncomingMessage>,
      time: number
    ) => {
      const sanitizePathname = getSanitizedPath(req.originalUrl ?? '/');
      const parsedPathname = getParsedPathname(sanitizePathname, undefined);
      console.log(this.tenantLabel);
      // TODO: Cover for undefined, if tenant label does not exist in the request params, don't emit it.
      const tenant = this.tenantLabel ? req.params[this.tenantLabel] : '';

      // TODO: Add support for replacing original tenant valeu from URL with tenantLabel
      const labels = {
        path: parsedPathname,
        status: res.statusCode.toString(),
        method: req.method as string,
        tenant: tenant
      };

      this.requestsCounter
        ?.labels(labels.path, labels.method, labels.status, labels.tenant)
        .inc();
      this.requestsDurationHistogram
        ?.labels(labels.path, labels.method, labels.status, labels.tenant)
        .observe(time);
    }
  );

  public instrument(moduleName: SupportedModules) {
    if (moduleName === 'mysql') {
      try {
        const mysql2 = require('mysql2');
        instrumentMySQL(mysql2);
      } catch (error) {
        throw new Error(
          "OpenAPM couldn't import the mysql2 package, please install it."
        );
      }
      return;
    }

    throw new Error(
      `OpenAPM doesn't support the following module: ${moduleName}`
    );
  }
}

export default OpenAPM;
