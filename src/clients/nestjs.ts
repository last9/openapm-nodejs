import { NestFactory } from '@nestjs/core';
import { wrap } from '../shimmer';

export const instrumentNest = (core: { NestFactory: typeof NestFactory }) => {
  wrap(
    core.NestFactory,
    'create',
    function (original: typeof NestFactory.create) {
      return async function (
        this: typeof NestFactory.create,
        args: Parameters<typeof NestFactory.create>
      ) {
        console.log('We are here');
        return await original.apply(this, args);
      };
    }
  );
};
