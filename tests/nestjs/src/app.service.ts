import { Injectable } from '@nestjs/common';
import { setOpenAPMLabels } from '../../../';

@Injectable()
export class AppService {
  getHello(): string {
    setOpenAPMLabels({ 'custom-label': 'custom-value' });
    return 'Hello World!';
  }
}
