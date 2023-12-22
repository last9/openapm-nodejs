import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OpenAPM } from '@last9/openapm';

async function bootstrap() {
  const openapm = new OpenAPM();
  openapm.instrument('nestjs');

  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
