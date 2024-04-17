import fs from 'fs';
import path from 'path';

/**
 *
 * @param projectDir Root of the project
 * @returns Path to the app directory
 */
export const getAppDir = (projectDir: string) => {
  let appDir = path.join(projectDir, 'app');
  if (fs.existsSync(appDir)) {
    return appDir;
  }
  appDir = path.join(projectDir, 'src', 'app');
  if (fs.existsSync(appDir)) {
    return appDir;
  }
  return null;
};

/**
 *
 * @param projectDir Root of the project
 * @returns Path to the pages directory
 */
export const getPagesDir = (projectDir: string) => {
  let pagesDir = path.join(projectDir, 'pages');
  if (fs.existsSync(pagesDir)) {
    return pagesDir;
  }
  pagesDir = path.join(projectDir, 'src', 'pages');
  if (fs.existsSync(pagesDir)) {
    return pagesDir;
  }
  return null;
};

/**
 * Removes '..' and '.' from the path and returns the normalized path
 * @param filePath
 * @param projectDir
 * @returns Normalized path
 */
export const getNormalizedPath = (filePath: string, projectDir: string) => {
  const absoluteResourcePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectDir, filePath);
  return path.normalize(absoluteResourcePath);
};

/**
 *
 * @param templatePath
 * @returns template code
 */
export const getTemplateCode = (templatePath: string) => {
  const template = path.resolve(templatePath);
  return fs.readFileSync(template, 'utf-8');
};
