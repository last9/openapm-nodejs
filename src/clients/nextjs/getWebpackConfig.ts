import type { NextConfig } from 'next';
import path from 'path';
import { WebpackConfigContext } from 'next/dist/server/config-shared';
import { getAppDir, getNormalizedPath, getPagesDir } from './utils';

const regexForValidFiles = /\.(ts|js|jsx|tsx)$/;

export const getWebpackConfig = (config: NextConfig) => {
  /**
   * Ref for ctx: https://nextjs.org/docs/app/api-reference/next-config-js/webpack
   */
  return (webpackCfg: any, ctx: WebpackConfigContext) => {
    let modifiedWebpackConfig = { ...webpackCfg };
    if (ctx.isServer) {
      // Check if the user has provided a custom webpack config
      if (typeof config.webpack === 'function') {
        modifiedWebpackConfig = config.webpack(webpackCfg, ctx);
      }

      // Adding empty rules array if they doesn't exist
      modifiedWebpackConfig['module'] = Object.assign(
        modifiedWebpackConfig['module'],
        {
          rules: [...(modifiedWebpackConfig.module?.rules || [])]
        }
      );

      const appDir = getAppDir(ctx.dir);
      const pagesDir = getPagesDir(ctx.dir);

      // For pages router
      if (pagesDir) {
        modifiedWebpackConfig.module.rules.unshift({
          test: (filePath: string): boolean => {
            if (regexForValidFiles.test(filePath)) {
              const normal = getNormalizedPath(filePath, config.dir);
              return normal.startsWith(path.join(pagesDir, 'api', path.sep));
            }
            return false;
          },
          use: {
            loader: path.join(__dirname, 'loader.js'),
            options: {
              type: 'page/api'
            }
          }
        });

        modifiedWebpackConfig.module.rules.unshift({
          test: (filePath: string): boolean => {
            if (regexForValidFiles.test(filePath)) {
              const normal = getNormalizedPath(filePath, config.dir);
              return (
                normal.startsWith(path.join(pagesDir, path.sep)) &&
                !normal.startsWith(path.join(pagesDir, 'api', path.sep))
              );
            }
            return false;
          },
          use: {
            loader: path.join(__dirname, 'loader.js'),
            options: {
              type: 'page'
            }
          }
        });
      }

      // For app router
      if (appDir) {
      }
    }
  };
};
