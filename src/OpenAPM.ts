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
  /**
   * @deprecated This option is deprecated and won't have any impact on masking the pathnames.
   * */
  customPathsToMask?: Array<RegExp>;
  /** Skip mentioned labels */
  excludeDefaultLabels?: Array<DefaultLabels>;
  /** Levitate Config */
  levitateConfig?: LevitateConfig;
}

export type SupportedModules = 'express' | 'mysql' | 'nestjs';

const moduleNames = {
  express: 'express',
  mysql: 'mysql2',
  nestjs: '@nestjs/core'
};

const packageJson = getPackageJson();

export class OpenAPM extends LevitateEvents {
  private simpleCache: Record<string, any> = {};
  private path: string;
  private metricsServerPort: number;
  readonly environment: string;
  readonly program: string;
  private defaultLabels?: Record<string, string>;
  private requestsCounterConfig: CounterConfiguration<string>;
  private requestDurationHistogramConfig: HistogramConfiguration<string>;
  private requestsCounter?: Counter;
  private requestsDurationHistogram?: Histogram;
  private extractLabels?: Record<string, ExtractFromParams>;
  private customPathsToMask?: Array<RegExp>;
  private excludeDefaultLabels?: Array<DefaultLabels>;

  public metricsServer?: Server;

  constructor(options?: OpenAPMOptions) {
    super(options);
    // Initializing all the options
    this.path = options?.path ?? '/metrics';
    this.metricsServerPort = options?.metricsServerPort ?? 9097;
    this.environment = options?.environment ?? 'production';
    this.program = packageJson?.name ?? '';
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
    this.customPathsToMask = options?.customPathsToMask;
    this.excludeDefaultLabels = options?.excludeDefaultLabels;

    this.initiateMetricsRoute();
    this.initiatePromClient();
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
    this.requestsCounter = new promClient.Counter(this.requestsCounterConfig);
    // Initiate the Duration Histogram for the requests
    this.requestsDurationHistogram = new promClient.Histogram(
      this.requestDurationHistogramConfig
    );
  };

  public shutdown = async () => {
    return new Promise((resolve, reject) => {
      console.log('Shutting down metrics server gracefully.');
      this.metricsServer?.close((err) => {
        promClient.register.clear();

        if (err) {
          reject(err);
          return;
        }

        resolve(undefined);
        console.log('Metrics server shut down gracefully.');
      });
    });
  };

  private initiateMetricsRoute = () => {
    // Creating native http server
    this.metricsServer = http.createServer(async (req, res) => {
      // Sanitize the path
      const path = getSanitizedPath(req.url ?? '/');
      if (path === this.path && req.method === 'GET') {
        res.setHeader('Content-Type', promClient.register.contentType);
        let metrics = '';
        if (
          typeof this.simpleCache['prisma:installed'] === 'undefined' ||
          this.simpleCache['prisma:installed']
        ) {
          try {
            // TODO: Make prisma implementation more generic so that it can be used with other ORMs, DBs and libraries
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();
            const prismaMetrics = prisma
              ? await prisma.$metrics.prometheus()
              : '';
            metrics += prisma ? prismaMetrics : '';
          } catch (error) {
            this.simpleCache['prisma:installed'] = false;
          }
        }

        metrics += await promClient.register.metrics();

        return res.end(metrics);
      } else {
        res.statusCode = 404;
        res.end('404 Not found');
      }
    });

    // Start listening at the given port defaults to 9097
    this.metricsServer?.listen(this.metricsServerPort, () => {
      console.log(`Metrics server running at ${this.metricsServerPort}`);
    });
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
      const path = req.route
        ? req.route?.path !== '*'
          ? req.baseUrl + req.route?.path
          : pathname
        : pathname;

      const labels: Record<string, string> = {
        path: path,
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

  /**
   * Middleware Function, which is essentially the response-time middleware with a callback that captures the
   * metrics
   * @deprecated
   */
  public REDMiddleware = this._REDMiddleware;

  public instrument(moduleName: SupportedModules) {
    try {
      if (moduleName === 'express') {
        const express = require('express');
        instrumentExpress(express, this._REDMiddleware, this);
      }
      if (moduleName === 'mysql') {
        const mysql2 = require('mysql2');
        instrumentMySQL(mysql2);
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
