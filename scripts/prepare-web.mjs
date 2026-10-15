import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'www');

const excluded = new Set([
  '.git',
  '.github',
  'android',
  'node_modules',
  'www',
  'coverage',
  'tests',
  'scripts',
  '.idea',
  '.vscode',
  '.DS_Store',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'capacitor.config.json',
  'jest.config.js'
]);

await mkdir(output, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (excluded.has(entry.name)) continue;
  const source = path.join(root, entry.name);
  const destination = path.join(output, entry.name);
  await cp(source, destination, {
    recursive: true,
    force: true,
    filter: (candidate) => {
      const relative = path.relative(root, candidate).split(path.sep);
      return !relative.some((part) => excluded.has(part));
    }
  });
}

console.log('ShiftPro web assets prepared in ./www');
