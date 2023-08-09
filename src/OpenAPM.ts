import * as os from 'os';
import express from 'express';
import ResponseTime from 'response-time';
import promClient from 'prom-client';

import type {
  Counter,
  CounterConfiguration,
  Histogram,
  HistogramConfiguration
} from 'prom-client';
import type { Express, Request } from 'express';
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
}

const packageJson = getPackageJson();

export class OpenAPM {
  private path: string;
  private metricsServerPort: number;
  private environment: string;
  private defaultLabels?: Record<string, string>;
  private requestsCounterConfig: CounterConfiguration<string>;
  private requestDurationHistogramConfig: HistogramConfiguration<string>;

  private metricsApp: Express;
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
      labelNames: ['path', 'method', 'status']
    };
    this.requestDurationHistogramConfig =
      options?.requestDurationHistogramConfig || {
        name: 'http_requests_duration_milliseconds',
        help: 'Duration of HTTP requests in milliseconds',
        labelNames: ['path', 'method', 'status'],
        buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
      };

    // Create the metrics app using express
    this.metricsApp = express();

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

  private initiateMetricsRoute = () => {
    // Adding merics route handler
    this.metricsApp.get(this.path, async (req, res) => {
      // Adding Content-Type header
      res.set('Content-Type', promClient.register.contentType);
      return res.end(await promClient.register.metrics());
    });

    // Listening metrics server
    this.metricsServer = this.metricsApp.listen(this.metricsServerPort, () => {
      console.log(`Metrics server started at port ${this.metricsServerPort}`);
    });
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

      const labels = {
        path: parsedPathname,
        status: res.statusCode.toString(),
        method: req.method as string
      };

      this.requestsCounter
        ?.labels(labels.path, labels.method, labels.status)
        .inc();
      this.requestsDurationHistogram
        ?.labels(labels.path, labels.method, labels.status)
        .observe(time);
    }
  );

  public instrument(moduleName: 'mysql2') {
    if (moduleName === 'mysql2') {
      try {
        const mysql = require('mysql2');
        instrumentMySQL(mysql);
      } catch (error) {
        throw new Error(
          "OpenAPM couldn't import the mysql2 package, please install it."
        );
      }
    }
  }
}

export default OpenAPM;
