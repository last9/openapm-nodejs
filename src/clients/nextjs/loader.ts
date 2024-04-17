import path from 'path';
import { getTemplateCode } from './utils';
import stitchTemplate from './stitchTemplate';
import { isCJS } from '../../utils';

export interface LoaderOptions {
  appDir: string;
  type: 'app/component';
}

export type LoaderProps = {
  resourcePath: string;
} & (
  | {
      query: LoaderOptions;
    }
  | {
      getOptions: () => LoaderOptions;
    }
);

export default async function loader(
  this: any,
  source: string,
  map: any
): Promise<string | undefined> {
  this.query = this.query || this.getOptions() || {};
  const { appDir } = this.query;
  const callback = this.async();

  if (this.query.type === 'server-component') {
    // Server Component
    const route = path
      .relative(appDir, this.resourcePath)
      .replace(/\\/g, '/')
      .replace(/(.*)/, '/$1')
      .replace(/\/[^/]+\.(js|ts|jsx|tsx)$/, '')
      .replace(/^$/, '/');

    const folder = isCJS() ? '' : 'esm';

    const componentName = path
      .basename(this.resourcePath)
      .replace(/\.(js|ts|jsx|tsx)$/, '');

    const templateCode = getTemplateCode(
      path.join(__dirname, 'templates', folder, 'server-component.js')
    )
      .replace(/COMPONENT_NAME_PLACEHOLDER/g, componentName)
      .replace(/ROUTE_PLACEHOLDER/g, route)
      .replace(/HANDLER_FILE_PATH/g, this.resourcePath);

    const code = await stitchTemplate(templateCode, source, map);
    callback(null, code, map);
    return;
  }

  callback(null, source, map);
  return;
}
