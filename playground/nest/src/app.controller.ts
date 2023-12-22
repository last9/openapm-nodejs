import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('organizations/:org/users')
  getUsers(): string {
    return this.appService.getHello();
  }

  @Get('cancel/:ids')
  cancel(): string {
    return this.appService.getHello();
  }

  @Get('api/v2/product/search/:term')
  search(): string {
    return this.appService.getHello();
  }
  @Get('api/v1/slug/:slug')
  v1Slug(): string {
    return this.appService.getHello();
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
