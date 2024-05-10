<a href="https://last9.io"><img src="https://last9.github.io/assets/last9-github-badge.svg" align="right" /></a>

# @last9/openapm

An APM solution based on metrics and open-source tools such as Prometheus and Grafana for NodeJs-based applications.

## Table of Contents

1. [Installation](#installation)
2. [Usage](#usage)
3. [Options](#options)
4. [API Reference](#api-reference)
5. [Setup Locally](#setup-locally)
6. [Grafana Dashboard View](#grafana-dashboard-view)

## Installation

```
npm install --save @last9/openapm@latest
```

## Usage

```js
const express = require('express');
const { OpenAPM } = require('@last9/openapm');

const app = express();
const openapm = new OpenAPM();

// Instrument services

app.listen(3000);

const gracefullyShutdown = () => {
  app.close(() => {
    openapm
      .shutdown()
      .then(() => {
        console.log('OpenAPM shutdown successful.');
      })
      .catch((err) => {
        console.log('Error shutting down OpenAPM', err);
      });
  });
};

process.on('SIGINT', gracefullyShutdown);
process.on('SIGTERM', gracefullyShutdown);
```

1. [Express](#express)
2. [MySQL](#mysql)
3. [NestJS](#nestjs)
4. [Next.js](#nextjs)

### Express

In the example below, the metrics will be served on `localhost:9097/metrics`. To
change the port, you can update it through the options
([See the options documentation](#options)).

```js
const { OpenAPM } = require('@last9/openapm');
const openapm = new OpenAPM();

openapm.instrument('express');
```

### MySQL

This currently supports instrumentation for all Node.js ORMs, which are [mysql2](https://www.npmjs.com/package/mysql2) compatible.

Ensure to add this line of code before you initialize db `connection/pool/poolCluster`.

```js
openapm.instrument('mysql');
```

### NestJS

OpenAPM currently supports RED Metrics for NestJS v4 and above.

```js
openapm.instrument('nestjs');
```

### Next.js

OpenAPM supports RED metrics for both pages and app router in a Next.js application.

```js
openapm.instrument('nextjs');
```

> Note: You can only use the library if Next.js runs in a Node.js environment. Since OpenAPM relies on prom-client for capturing metrics data, a serverless environment might not be able persist them.

## Options

### Usage

```js
const openapm = new OpenAPM({
  // Options go here
});
```

1. `path`: The path at which the metrics will be served. For eg. `/metrics`
2. `metricsServerPort`: (Optional) The port at which the metricsServer will run.
3. `environment`: (Optional) The application environment. Defaults to
   `production`.
4. `defaultLabels`: (Optional) Any default labels to be included.
5. `requestsCounterConfig`: (Optional) Requests counter configuration, same as
   [Counter](https://github.com/siimon/prom-client#counter) in `prom-client`.
   Defaults to

   ```js
   {
      name: 'http_requests_total',
      help: 'Total number of requests',
      labelNames: ['path', 'method', 'status'],
    }
   ```

6. `requestDurationHistogramConfig`: (Optional) Requests Duration histogram
   configuration, the same as
   [Histogram](https://github.com/siimon/prom-client#histogram) in
   `prom-client`. Defaults to
   ```js
    {
        name: 'http_requests_duration_milliseconds',
        help: 'Duration of HTTP requests in milliseconds',
        labelNames: ['path', 'method', 'status'],
        buckets: promClient.exponentialBuckets(0.25, 1.5, 31),
      }
   ```
7. `extractLabels`: (Optional) Extract labels from URL params (WIP: Headers, Subdomain)
   ```js
   // To extract from the URL params
   {
      ...
      extractLabels: {
         tenant: { // Here 'tenant' is the label name
            from : 'params',
            key: 'org' // Which key to extract from the params
            mask: ':org' // Replacement string
         }
      }
   }
   ```
8. `excludeDefaultLabels`: (Optional) Provide labels to exclude from the default labels

```js
{
  ...
  excludeDefaultLabels: ['environment', 'version']
}
```

9. `levitateConfig`: (Optional) Configuration for Levitate TSDB. Adding this configuration will enable the [Change Events](https://docs.last9.io/docs/change-events).

10. `enableMetricsServer`: (Optional) Defaults to `true`. When set to `false` the OpenAPM won't start a metrics server. To get the metrics users can rely on the `.getMetrics()` function.

```js
{
   ...
   levitateConfig: {
      host: 'https://app.last9.io',
      orgSlug: 'last9', /** The slug can be obtained from the Last9 dashboard.*/
      dataSourceName: 'data-source', /** The data source can be obtained from the data source pages in the Last9 dashboard*/
      refreshTokens: {
         write: '0d2a1a9a45XXXXXXXXXXXXXX3f1342790d2a1a9a45XXXXXXXXXXXXXX3f1342790d2a1a9a45XXXXXXXXXXXXXX3f134279' /** You can get this from the API access page on Last9 dashboard*/
      }
   }
}
```

11. `enabled`: (Optional) Defaults to `true`. When set to `false` OpenAPM will be disabled and no metrics will be collected or emitted.

```
const openapm = new OpenAPM({
  enabled: process.env.NODE_ENV === 'production'
})
```

12. `additionalLabels`: (Optional) Accepts an array of label keys that will be emitted with the metrics. This option is used in tandem with the `setOpenAPMLabels` API. Checkout [API Reference](#api-reference)

```
const openapm = new OpenAPM({
  additionalLabels: ['slug']
})
```

## API Reference

1. `instrument`: Used to instrument supported technologies. Refer the [usage](#usage) section.

2. `getMetrics`: Returns a Promise of string which contains metrics in Prometheus exposition format. You can use this function to expose a metrics endpoint if `enableMetricsServer` is set to false. For example,

```js
const openapm = new OpenAPM({
  enableMetricsServer: false
});

openapm.instrument('express');

const app = express();

app.get('/metrics', async (_, res) => {
  const metrics = await openapm.getMetrics();
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.end(metrics);
});
```

3. `shutdown`: Returns a promise which is resolved after the cleanup in OpenAPM. The cleanup includes closing the metrics server if it has started and cleared the prom-client register.

```js
const gracefullyShutdown = () => {
  server.close(() => {
    openapm
      .shutdown()
      .then(() => {
        console.log('OpenAPM shutdown successful.');
      })
      .catch((err) => {
        console.log('Error shutting down OpenAPM', err);
      });
  });
};

process.on('SIGINT', gracefullyShutdown);
process.on('SIGTERM', gracefullyShutdown);
```

4. `setOpenAPMLabels`: Unlike other APIs. You can directly import `setOpenAPMLabels` in any file to set custom labels to the request. Make sure to mention the label key in `additionalLabels` option. This function can set multiple labels in the metrics emitted by the ongoing HTTP request.

Note: `setOpenAPMLabels` currently works with **express** and **Nest.js** only.

```js
import { OpenAPM, setOpenAPMLabels } from '@last9/openapm';

const openapm = new OpenAPM({
  additionalLabels: ['slug']
});

const handler = () => {
  setOpenAPMLabels({ slug: 'org-slug' });
};
```

## Setup locally

Make sure you are in the express directory.

- Install packages

```
npm install
```

- Build package

  - This will build the package and store the JS and type declaration files in
    the `dist` folder.

```
npm run build
```

# Grafana Dashboard View

1. Import [this](./APM-Grafana-Dashboard.json) dashboard into your Grafana
2. Select your data source
3. Save the dashboard

![APM Dashboard](images/apm-dashboard-1.png)
![APM Dashboard](images/apm-dashboard-2.png)
![APM Dashboard](images/apm-dashboard-3.png)

# About Last9

[Last9](https://last9.io) builds reliability tools for SRE and DevOps.

<a href="https://last9.io"><img src="https://last9.github.io/assets/email-logo-green.png" alt="" loading="lazy" height="40px" /></a>
