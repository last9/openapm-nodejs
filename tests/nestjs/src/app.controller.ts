import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { setOpenAPMLabels } from '../../../src/async-local-storage.http';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    setOpenAPMLabels({ slug: 'custom-slug' });
    return this.appService?.getHello();
  }
}
