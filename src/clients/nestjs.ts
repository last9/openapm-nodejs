import * as os from 'os';
import { isWrapped, wrap } from '../shimmer';
import type { NestFactoryStatic } from '@nestjs/core/nest-factory';
import type { NestApplication } from '@nestjs/core';
import type OpenAPM from '../OpenAPM';

export const instrumentNestFactory = (
  nestFactory: NestFactoryStatic,
  redMiddleware: Function,
  openapm: OpenAPM
) => {
  // Check if the NestFactory is already wrapped
  if (!isWrapped(nestFactory, 'create')) {
    // Wrap using the wrapper function
    wrap(
      nestFactory,
      'create',
      function (original: NestFactoryStatic['create']) {
        return async function (this: NestFactoryStatic['create'], ...args) {
          const app = await original.apply(
            this,
            args as Parameters<NestFactoryStatic['create']>
          );
          // Add a global RED Middleware to the application
          app.use(redMiddleware);

          wrap(app, 'listen', (ogListen: NestApplication['listen']) => {
            return function (
              this: NestApplication['listen'],
              ...args: Parameters<NestApplication['listen']>
            ) {
              openapm.emit('application_started', {
                timestamp: new Date().toISOString(),
                event_name: `${openapm.program}_app`,
                event_state: 'start',
                entity_type: 'app',
                workspace: os.hostname(),
                namespace: openapm.environment,
                data_source_name: openapm.levitateConfig?.dataSourceName ?? ''
              });
              return ogListen.apply(this, args);
            } as NestApplication['listen'];
          });

          return app;
        };
      }
    );
  }
};
