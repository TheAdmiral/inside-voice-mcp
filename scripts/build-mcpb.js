#!/usr/bin/env node

/**
 * Builds build/inside-voice.mcpb, a bundle that adds Inside Voice to Claude Desktop
 * when opened.
 *
 * The bundle does not contain the server. It holds a manifest and a small launcher that
 * starts the server Homebrew installed, so the bundle never goes out of date.
 *
 * A .mcpb file is a zip archive with manifest.json at the top level.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };
import { tools } from '../src/index.js';
import { bundle } from '../src/strings.js';

const projectDir = join(import.meta.dirname, '..');
const buildDir = join(projectDir, 'build');
const bundleDir = join(buildDir, 'mcpb');
const bundlePath = join(buildDir, 'inside-voice.mcpb');
const launcherPath = 'server/inside-voice-mcp.sh';

const repositoryUrl = 'https://github.com/TheAdmiral/inside-voice-mcp';

const manifest = {
  manifest_version: '0.3',
  name: 'inside-voice',
  display_name: bundle.displayName,
  version: packageJson.version,
  description: bundle.description,
  long_description: bundle.longDescription,
  author: { name: 'TheAdmiral', url: 'https://github.com/TheAdmiral' },
  repository: { type: 'git', url: repositoryUrl },
  homepage: repositoryUrl,
  support: `${repositoryUrl}/issues`,
  license: packageJson.license,
  keywords: packageJson.keywords,
  server: {
    type: 'binary',
    entry_point: launcherPath,
    mcp_config: {
      // Running the launcher through bash means it does not need to be executable.
      command: '/bin/bash',
      args: [`\${__dirname}/${launcherPath}`],
    },
  },
  tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
  compatibility: { platforms: ['darwin'] },
};

rmSync(bundleDir, { recursive: true, force: true });
rmSync(bundlePath, { force: true });
mkdirSync(join(bundleDir, 'server'), { recursive: true });

writeFileSync(join(bundleDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(
  join(projectDir, 'packaging', 'mcpb', 'inside-voice-mcp.sh'),
  join(bundleDir, launcherPath),
);

// -X leaves out macOS extended attributes, which Claude Desktop does not need.
execFileSync('zip', ['-r', '-X', '-q', bundlePath, '.'], { cwd: bundleDir, stdio: 'inherit' });

console.log(bundle.built(bundlePath));
