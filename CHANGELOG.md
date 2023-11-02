# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2023-11-2

- Add `excludeDefaultLabels` to the options.
- Add support to instrument `NestJS`
- Migrate from Rollup to tsup for building package

## [0.3.0] - 2023-10-9

### Added

- Add `extractLabels` to the options to extract any labels from the URL params such as a tenant or org name allowing support for multi-tenant monitoring.
-
- Gracefully shutdown metrics server

## [0.2.2] - 2023-08-28

### Added

- Track the success or failure of database queries with the `status` label in the `db_requests_duration_milliseconds` metric. Supported values - `success` and `failure`.

## [0.2.1] - 2023-08-23

### Added

- Auto instrumentation of Rate and Duration metrics for MySQL DB
- Preconfigured Grafana dashboard JSON that can be imported directly

## [0.1.1] - 2023-07-26

### Added

- Auto instrumentation of R.E.D (Rate, Errors & Duration) metrics for Express.js
