import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import UrlValueParser from "url-value-parser";

export const getPackageJson = () => {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  try {
    const packageJson = fs.readFileSync(packageJsonPath, "utf-8");
    return JSON.parse(packageJson);
  } catch (error) {
    console.error("Error parsing package.json");
    return null;
  }
};

export const getHostIpAddress = () => {
  const networkInterfaces = os.networkInterfaces();

  // Iterate over network interfaces to find a non-internal IPv4 address
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    if (typeof interfaces !== "undefined") {
      for (const iface of interfaces) {
        // Skip internal and non-IPv4 addresses
        if (!iface.internal && iface.family === "IPv4") {
          return iface.address;
        }
      }
    }
  }

  // Return null if no IP address is found
  return null;
};

export const getParsedPathname = (
  pathname: string,
  extraMasks?: Array<RegExp>,
  replacement: string = ":id"
) => {
  const parser = new UrlValueParser({ extraMasks });
  return parser.replacePathValues(pathname, replacement);
};
