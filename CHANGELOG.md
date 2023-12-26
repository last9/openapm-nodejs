# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2023-12-26

### Added

- Skip the `OPTIONS` requests from the instrumentation process.
  
## [0.6.0] - 2023-12-22

### Added

- Ability to automatically detect correct `path` labels based on routes defined by users in their applications. This will solve the cardinality blowup of endpoints not being folded correctly.

### Deprecated

- Optional `customPathsToMask` option to mask certain values as it is no longer needed now. It will be removed in
  future releases.

## [0.5.0] - 2023-12-4

### Added

- Optional [Change Events](https://docs.last9.io/docs/change-events) Support. Track `application_start` event for Express applications in Levitate along with other APM metrics.

## [0.4.0] - 2023-11-2

### Added

- Add `excludeDefaultLabels` to the options.
- Add support to instrument `NestJS` applications.

### Changed

- Migrate from Rollup to tsup for building package.

## [0.3.0] - 2023-10-9

### Added

- Add `extractLabels` to the options to extract any labels from the URL params such as a tenant or org name allowing support for multi-tenant monitoring.
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
