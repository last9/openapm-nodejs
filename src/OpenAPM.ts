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

export type ExtractFromParams = {
  from: 'params';
  key: string;
  mask: string;
};

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
  /** Extract labels from URL params, subdomain, header */
  extractLabels?: Record<string, ExtractFromParams>;
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
  private requestsCounter?: Counter;
  private requestsDurationHistogram?: Histogram;
  private extractLabels?: Record<string, ExtractFromParams>;
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
      labelNames: [
        'path',
        'method',
        'status',
        ...(options?.extractLabels ? Object.keys(options?.extractLabels) : [])
      ]
    };
    this.requestDurationHistogramConfig =
      options?.requestDurationHistogramConfig || {
        name: 'http_requests_duration_milliseconds',
        help: 'Duration of HTTP requests in milliseconds',
        labelNames: [
          'path',
          'method',
          'status',
          ...(options?.extractLabels ? Object.keys(options?.extractLabels) : []) // If the extractLabels exists add the labels to the label set
        ],
        buckets: promClient.exponentialBuckets(0.25, 1.5, 31)
      };

    this.extractLabels = options?.extractLabels ?? {};

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

  private parseLabelsFromParams = (
    pathname: string,
    params: Request['params']
  ) => {
    const labels = {} as Record<string, string | undefined>;
    // Get the label configs and filter it only for param values
    const configs = Object.keys(this.extractLabels ?? {})
      .filter((labelName) => {
        // Filter out the configs that doesn't have "from" key set to "params", also check if the required param actually exists
        return (
          this.extractLabels?.[labelName].from === 'params' &&
          typeof params[this.extractLabels[labelName].key] === 'string'
        );
      })
      .map((labelName) => {
        return {
          ...this.extractLabels?.[labelName],
          label: labelName
        };
      });

    let parsedPathname = pathname;
    for (const item of configs) {
      if (item.key && item.label && item.from) {
        const labelValue = params[item.key];
        const escapedLabelValue = labelValue.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        );
        const regex = new RegExp(escapedLabelValue, 'g');

        // Replace the param with a generic mask that user has specified
        if (item.mask) {
          parsedPathname = parsedPathname.replace(regex, item.mask);
        }

        // Add the value to the label set
        labels[item.label] = escapedLabelValue;
      }
    }

    return {
      pathname: parsedPathname,
      labels
    };
  };

  // Middleware Function, which is essentially the response-time middleware with a callback that captures the
  // metrics
  public REDMiddleware = ResponseTime(
    (
      req: IncomingMessage & Request,
      res: ServerResponse<IncomingMessage>,
      time: number
    ) => {
      const sanitizedPathname = getSanitizedPath(req.originalUrl ?? '/');
      const { pathname, labels: parsedLabelsFromPathname } =
        this.parseLabelsFromParams(sanitizedPathname, req.params);
      const parsedPathname = getParsedPathname(pathname, undefined);
      // Extract labels from the request params

      const labels: Record<string, string> = {
        path: parsedPathname,
        status: res.statusCode.toString(),
        method: req.method as string,
        ...parsedLabelsFromPathname
      };

      // Create an array of arguments in the same sequence as label names
      const requestsCounterArgs = this.requestsCounterConfig.labelNames?.map(
        (labelName) => {
          return labels[labelName] ?? '';
        }
      );

      if (requestsCounterArgs) {
        this.requestsCounter?.labels(...requestsCounterArgs).inc();
        this.requestsDurationHistogram
          ?.labels(...requestsCounterArgs)
          .observe(time);
      }
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
