import * as os from 'os';
import http from 'http';
import ResponseTime from 'response-time';
import promClient from 'prom-client';
import {
  DiagConsoleLogger,
  DiagLogLevel,
  Meter,
  diag,
  metrics
} from '@opentelemetry/api';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  ConsoleMetricExporter
} from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';

import type {
  Counter,
  CounterConfiguration,
  Histogram,
  HistogramConfiguration
} from 'prom-client';
import type { Request } from 'express';
import type { IncomingMessage, ServerResponse, Server } from 'http';

import { getHostIpAddress, getPackageJson, getSanitizedPath } from './utils';

import { instrumentExpress } from './clients/express';
import { instrumentMySQL } from './clients/mysql2';
import { instrumentNestFactory } from './clients/nestjs';
import { LevitateConfig, LevitateEvents } from './levitate/events';

export type ExtractFromParams = {
  from: 'params';
  key: string;
  mask: string;
};

export type DefaultLabels =
  | 'environment'
  | 'program'
  | 'ip'
  | 'version'
  | 'host';

export type OpenAPMMode = 'openmetrics' | 'opentelemetry';

export interface OpenAPMOptions {
  /** Mode - openmetrics or opentelemetry
   * @default "openmetrics"
   */
  mode?: OpenAPMMode;
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
  /** Accepts configuration for Requests Counter  */
  requestsCounterConfig?: CounterConfiguration<string>;
  /** Accepts configuration for Requests Histogram */
  requestDurationHistogramConfig?: HistogramConfiguration<string>;
  /** Extract labels from URL params, subdomain, header */
  extractLabels?: Record<string, ExtractFromParams>;
  /** Skip mentioned labels */
  excludeDefaultLabels?: Array<DefaultLabels>;
  /** Levitate Config */
  levitateConfig?: LevitateConfig;
}

export type SupportedModules = 'express' | 'mysql' | 'nestjs';

// Optional and only needed to see the internal diagnostic logging (during development)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const moduleNames = {
  express: 'express',
  mysql: 'mysql2',
  nestjs: '@nestjs/core'
};

const packageJson = getPackageJson();

export class OpenAPM extends LevitateEvents {
  private mode: string;
  private path: string;
  private metricsServerPort: number;
  readonly environment: string;
  readonly program: string;
  private defaultLabels?: Record<string, string>;
  private openMetricsRequestsCounterConfig: CounterConfiguration<string>;
  private requestDurationHistogramConfig: HistogramConfiguration<string>;
  private openMetricsMeters: {
    requestsCounter?: Counter;
    requestsDurationHistogram?: Histogram;
  };
  private openTelemetryMeters?: {
    requestsCounter?: ReturnType<Meter['createCounter']>;
    requestsDurationHistogram?: ReturnType<Meter['createHistogram']>;
  };
  private extractLabels?: Record<string, ExtractFromParams>;
  private excludeDefaultLabels?: Array<DefaultLabels>;

  public metricsServer?: Server;

  constructor(options?: OpenAPMOptions) {
    super(options);

    this.mode = options?.mode ?? 'openmetrics';

    // Initializing all the options
    this.path = options?.path ?? '/metrics';
    this.metricsServerPort = options?.metricsServerPort ?? 9097;
    this.environment = options?.environment ?? 'production';
    this.program = packageJson?.name ?? '';
    this.defaultLabels = options?.defaultLabels;
    this.openMetricsRequestsCounterConfig = options?.requestsCounterConfig ?? {
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

    this.openMetricsMeters = {};
    this.openTelemetryMeters = {};

    this.extractLabels = options?.extractLabels ?? {};
    this.excludeDefaultLabels = options?.excludeDefaultLabels;

    if (this.mode === 'openmetrics') {
      this.initiateMetricsRoute();
      this.initiatePromClient();
    } else if (this.mode === 'opentelemetry') {
      const resource = Resource.default().merge(
        new Resource({
          [SEMRESATTRS_SERVICE_NAME]: this.program,
          [SEMRESATTRS_SERVICE_VERSION]: packageJson.version
        })
      );

      const metricReader = new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        // Default is 60000ms (60 seconds). Set to 10 seconds for demonstrative purposes only.
        exportIntervalMillis: 10000
      });

      const meterProvider = new MeterProvider({
        resource: resource,
        readers: [metricReader]
      });

      // Set this MeterProvider to be global to the app being instrumented.
      metrics.setGlobalMeterProvider(meterProvider);
      const meter = meterProvider.getMeter('openapm-collector');

      this.openTelemetryMeters['requestsCounter'] = meter.createCounter(
        'http_requests_total',
        {
          description: 'Total number of requests'
        }
      );

      this.openTelemetryMeters['requestsDurationHistogram'] =
        meter.createHistogram('http_requests_duration_milliseconds', {
          description: 'Duration of HTTP requests in milliseconds'
        });
    } else {
      console.log(this.mode + ' not supported');
    }
  }

  private getDefaultLabels = () => {
    const defaultLabels = {
      environment: this.environment,
      program: packageJson.name,
      version: packageJson.version,
      host: os.hostname(),
      ip: getHostIpAddress(),
      ...this.defaultLabels
    };

    if (Array.isArray(this.excludeDefaultLabels)) {
      for (const label of this.excludeDefaultLabels) {
        Reflect.deleteProperty(defaultLabels, label);
      }
    }

    return defaultLabels;
  };

  private initiatePromClient = () => {
    promClient.register.setDefaultLabels(this.getDefaultLabels());

    promClient.collectDefaultMetrics({
      gcDurationBuckets: this.requestDurationHistogramConfig.buckets
    });

    // Initiate the Counter for the requests
    this.openMetricsMeters['requestsCounter'] = new promClient.Counter(
      this.openMetricsRequestsCounterConfig
    );
    // Initiate the Duration Histogram for the requests
    this.openMetricsMeters['requestsDurationHistogram'] =
      new promClient.Histogram(this.requestDurationHistogramConfig);
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
    params?: Request['params']
  ) => {
    const labels = {} as Record<string, string | undefined>;
    let parsedPathname = pathname;
    if (typeof params === 'undefined' || params === null) {
      return {
        pathname,
        labels
      };
    }
    // Get the label configs and filter it only for param values
    const configs = Object.keys(this.extractLabels ?? {}).map((labelName) => {
      return {
        ...this.extractLabels?.[labelName],
        label: labelName
      };
    });

    for (const item of configs) {
      if (
        item.key &&
        item.label &&
        item.from === 'params' &&
        params?.[item.key]
      ) {
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

  /**
   * Middleware Function, which is essentially the response-time middleware with a callback that captures the
   * metrics
   */
  private _REDMiddleware = ResponseTime(
    (
      req: IncomingMessage & Request,
      res: ServerResponse<IncomingMessage>,
      time: number
    ) => {
      const sanitizedPathname = getSanitizedPath(req.originalUrl ?? '/');
      // Extract labels from the request params
      const { pathname, labels: parsedLabelsFromPathname } =
        this.parseLabelsFromParams(sanitizedPathname, req.params);

      // Skip the OPTIONS requests not to blow up cardinality. Express does not provide
      // information about the route for OPTIONS requests, which makes it very
      // hard to detect correct PATH. Until we fix it properly, the requests are skipped
      // to not blow up the cardinality.
      if (!req.route && req.method === 'OPTIONS') {
        return;
      }

      // Make sure you copy baseURL in case of nested routes.
      const path = req.route ? req.baseUrl + req.route?.path : pathname;
      const labels: Record<string, string> = {
        path: path,
        status: res.statusCode.toString(),
        method: req.method as string,
        ...parsedLabelsFromPathname
      };

      if (this.mode === 'openmetrics') {
        // Create an array of arguments in the same sequence as label names
        const openMetricsRequestsCounterArgs =
          this.openMetricsRequestsCounterConfig.labelNames?.map((labelName) => {
            return labels[labelName] ?? '';
          });

        if (openMetricsRequestsCounterArgs) {
          this.openMetricsMeters.requestsCounter
            ?.labels(...openMetricsRequestsCounterArgs)
            .inc();
          this.openMetricsMeters.requestsDurationHistogram
            ?.labels(...openMetricsRequestsCounterArgs)
            .observe(time);
        }
      } else if (this.mode === 'opentelemetry') {
        this.openTelemetryMeters?.['requestsCounter']?.add(1, labels);
        this.openTelemetryMeters?.['requestsDurationHistogram']?.record(
          time,
          labels
        );
      } else {
        console.log(this.mode + ' is not supported');
      }
    }
  );

  public instrument(moduleName: SupportedModules) {
    try {
      if (moduleName === 'express') {
        const express = require('express');
        instrumentExpress(express, this._REDMiddleware, this);
      }
      if (moduleName === 'mysql') {
        const mysql2 = require('mysql2');
        instrumentMySQL(mysql2, this.mode);
      }
      if (moduleName === 'nestjs') {
        const { NestFactory } = require('@nestjs/core');
        instrumentNestFactory(NestFactory, this._REDMiddleware);
      }
    } catch (error) {
      if (Object.keys(moduleNames).includes(moduleName)) {
        console.log(error);
        throw new Error(
          `OpenAPM couldn't import the ${moduleNames[moduleName]} package, please install it.`
        );
      } else {
        throw new Error(
          `OpenAPM doesn't support the following module: ${moduleName}`
        );
      }
    }
  }
}

export default OpenAPM;
