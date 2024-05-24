import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const getPackageJson = () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  try {
    const packageJson = fs.readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(packageJson);
  } catch (error) {
    console.error('Error parsing package.json');
    return null;
  }
};

export const getHostIpAddress = () => {
  const networkInterfaces = os.networkInterfaces();

  // Iterate over network interfaces to find a non-internal IPv4 address
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    if (typeof interfaces !== 'undefined') {
      for (const iface of interfaces) {
        // Skip internal and non-IPv4 addresses
        if (!iface.internal && iface.family === 'IPv4') {
          return iface.address;
        }
      }
    }
  }

  // Return null if no IP address is found
  return null;
};

export const getSanitizedPath = (pathname: string) => {
  /**
   * Regex will remove any hashes or the search param in the pathname
   * @example /foo?bar=zar -> /foo
   * @example /foo#intro  -> /foo
   * @example /foo?lorem=ipsum&bar=zar -> /foo
   */
  const sanitizedPath = pathname.replace(
    /(\/[^?#]+)(?:\?[^#]*)?(?:#.*)?$/,
    '$1'
  );
  return sanitizedPath;
};

export const maskValuesInSQLQuery = (query: string) => {
  let counter = 1;
  // Regular expression to match strings and numbers.
  // Assumes strings are wrapped with single quotes.
  const regex = /'[^']*'|(\b\d+\b)/g;

  return query.replace(regex, (match) => {
    // If the match is a number or a string, replace it.
    if (match.match(/^\d+$/) || match.startsWith("'")) {
      return `$${counter++}`;
    }
    // If not, return the original match (should not occur with the current regex)
    return match;
  });
};

export const isCJS = () => {
  return typeof exports === 'object' && typeof module !== 'undefined';
};
