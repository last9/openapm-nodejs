import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import {
  AggregationTemporality,
  AggregationTemporalitySelector,
  InstrumentType,
  PushMetricExporter,
  ResourceMetrics
} from '@opentelemetry/sdk-metrics';
import { DEFAULT_AGGREGATION_TEMPORALITY_SELECTOR } from '@opentelemetry/sdk-metrics/build/src/export/AggregationSelector';

export class PrometheusRemoteWriteExporter implements PushMetricExporter {
  protected _shutdown = false;
  protected _temporalitySelector: AggregationTemporalitySelector;

  constructor(options?: {
    temporalitySelector?: AggregationTemporalitySelector;
  }) {
    this._temporalitySelector =
      options?.temporalitySelector ?? DEFAULT_AGGREGATION_TEMPORALITY_SELECTOR;
  }
  export(
    metrics: ResourceMetrics,
    resultCallback: (result: ExportResult) => void
  ): void {
    if (this._shutdown) {
      // If the exporter is shutting down, by spec, we need to return FAILED as export result
      setImmediate(resultCallback, { code: ExportResultCode.FAILED });
      return;
    }

    return PrometheusRemoteWriteExporter._sendMetrics(metrics, resultCallback);
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  selectAggregationTemporality(
    _instrumentType: InstrumentType
  ): AggregationTemporality {
    return this._temporalitySelector(_instrumentType);
  }

  shutdown(): Promise<void> {
    this._shutdown = true;
    return Promise.resolve();
  }

  private static _sendMetrics(
    metrics: ResourceMetrics,
    done: (result: ExportResult) => void
  ): void {
    for (const scopeMetrics of metrics.scopeMetrics) {
      for (const metric of scopeMetrics.metrics) {
        console.dir(
          {
            descriptor: metric.descriptor,
            dataPointType: metric.dataPointType,
            dataPoints: metric.dataPoints
          },
          { depth: null }
        );
      }
    }

    done({ code: ExportResultCode.SUCCESS });
  }
}
