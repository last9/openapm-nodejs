import type { NextConfig } from 'next';
import { getWebpackConfig } from './getWebpackConfig';

export const withOpenAPM = (config: NextConfig) => {
  return {
    ...config,
    webpack: getWebpackConfig(config)
  };
};
