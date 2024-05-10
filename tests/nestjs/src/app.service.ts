import { Injectable } from '@nestjs/common';
import { setOpenAPMLabels } from '../../../src/async-local-storage.http';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
