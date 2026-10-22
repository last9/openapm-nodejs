import { readFileSync } from 'fs';
import { join } from 'path';
import semver from 'semver';
import { describe, expect, test } from 'vitest';

// Node releases before these patches accept TLS chains through the
// compromised eMudhra intermediates (nodejs/node#66871, issue #58).
const PATCHED_FLOORS = ['22.23.4', '24.22.1', '26.12.1'];
const UNPATCHED = [
  '18.19.0',
  '20.19.5',
  '22.23.3',
  '23.11.1',
  '24.22.0',
  '25.9.0',
  '26.12.0'
];

const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const engines: string = JSON.parse(read('package.json')).engines?.node ?? '';

const ciNodeVersions = () => {
  const matrix = read('.github/workflows/build.yml').match(
    /node-version:\s*\[([^\]]*)\]/
  );
  return matrix
    ? matrix[1].split(',').map((v) => v.trim().replace(/['"]/g, ''))
    : [];
};

describe('Node runtime pins', () => {
  test('engines.node admits each patched floor', () => {
    for (const version of PATCHED_FLOORS) {
      expect(semver.satisfies(version, engines), version).toBe(true);
    }
  });

  test('engines.node rejects releases without the eMudhra blocklist', () => {
    expect(engines).not.toBe('');
    for (const version of UNPATCHED) {
      expect(semver.satisfies(version, engines), version).toBe(false);
    }
  });

  test('CI tests exactly the patched floors', () => {
    expect(ciNodeVersions()).toEqual(PATCHED_FLOORS);
  });

  test('.nvmrc pins a CI-tested patched floor', () => {
    expect(PATCHED_FLOORS).toContain(read('.nvmrc').trim());
  });
});
