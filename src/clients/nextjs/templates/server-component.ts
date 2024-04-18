import prom from 'prom-client';
import type { FunctionComponent } from 'react';
// @ts-ignore
import * as serverComponent from 'HANDLER_FILE_PATH';
/**
 * route = ROUTE_PLACEHOLDER
 * component = COMPONENT_NAME_PLACEHOLDER
 */

const wrapper = (component: FunctionComponent) => {
  return new Proxy(component, {
    apply: (target, thisArg, argumentsList) => {
      console.log('COMPONENT_NAME_PLACEHOLDER', 'ROUTE_PLACEHOLDER');
      const result = Reflect.apply(target, thisArg, argumentsList);
      return result;
    }
  });
};

// @ts-ignore
export * from 'HANDLER_FILE_PATH';
export default wrapper(serverComponent.default);
