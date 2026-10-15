import { readFile, writeFile } from 'node:fs/promises';

const gradlePath = 'android/app/build.gradle';
let gradle = await readFile(gradlePath, 'utf8');

if (!gradle.includes('signingConfigs {')) {
  const buildTypesMatch = gradle.match(/(\n\s*)buildTypes\s*\{/);
  if (!buildTypesMatch || buildTypesMatch.index == null) {
    throw new Error('Could not find android buildTypes block in android/app/build.gradle');
  }

  const indent = buildTypesMatch[1] + '    ';
  const signingBlock = [
    indent + 'signingConfigs {',
    indent + '    release {',
    indent + "        storeFile file(System.getenv('SIGNING_STORE_FILE'))",
    indent + "        storePassword System.getenv('SIGNING_STORE_PASSWORD')",
    indent + "        keyAlias System.getenv('SIGNING_KEY_ALIAS')",
    indent + "        keyPassword System.getenv('SIGNING_KEY_PASSWORD')",
    indent + '    }',
    indent + '}',
    ''
  ].join('\n');

  gradle = gradle.slice(0, buildTypesMatch.index) + '\n' + signingBlock + gradle.slice(buildTypesMatch.index);
}

const buildTypesIndex = gradle.indexOf('buildTypes {');
if (buildTypesIndex < 0) throw new Error('buildTypes block not found after signing config insertion');

const releaseIndex = gradle.indexOf('release {', buildTypesIndex);
if (releaseIndex < 0) throw new Error('release build type not found');

const releaseBodyIndex = releaseIndex + 'release {'.length;
const afterRelease = gradle.slice(releaseBodyIndex);
if (!afterRelease.includes('signingConfig signingConfigs.release')) {
  gradle = gradle.slice(0, releaseBodyIndex) + '\n            signingConfig signingConfigs.release' + gradle.slice(releaseBodyIndex);
}

await writeFile(gradlePath, gradle, 'utf8');
console.log('Configured Android release signing from environment variables.');
