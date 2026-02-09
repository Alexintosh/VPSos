#!/usr/bin/env bun
/**
 * VPSos Build Pipeline
 * 
 * Creates standalone executables for the VPSos web desktop.
 * 
 * Usage:
 *   bun run build          # Full build (web + API + package)
 *   bun run build:web      # Build web frontend only
 *   bun run build:api      # Build API executable only
 *   bun run build:all      # Full build
 *   bun run clean          # Clean dist directory
 * 
 * Or use Make:
 *   make build             # Full build
 *   make build-web         # Web only
 *   make build-api         # API only
 *   make clean-dist        # Clean
 */

import { $ } from 'bun';
import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIST_DIR = './dist';
const PLATFORMS = ['bun', 'node'] as const;
type Platform = typeof PLATFORMS[number];

// Get platform from args
const platform: Platform = (process.argv.find(a => a.startsWith('--platform='))?.split('=')[1] as Platform) || 'bun';

interface BuildOptions {
  web?: boolean;
  api?: boolean;
  package?: boolean;
}

async function clean() {
  console.log('🧹 Cleaning dist directory...');
  if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true, force: true });
  }
  mkdirSync(DIST_DIR, { recursive: true });
}

async function buildWeb() {
  console.log('📦 Building web frontend...');
  
  // Ensure web build output is clean
  if (existsSync('apps/web/dist')) {
    rmSync('apps/web/dist', { recursive: true, force: true });
  }
  
  await $`cd apps/web && bun run build`;
  
  const webDist = 'apps/web/dist';
  if (!existsSync(webDist)) {
    throw new Error('Web build failed - dist directory not found');
  }
  
  // Copy to dist/web
  cpSync(webDist, join(DIST_DIR, 'web'), { recursive: true });
  console.log('✅ Web assets copied to dist/web');
}

async function compileAPI(targetPlatform: Platform = 'bun') {
  console.log(`🔨 Compiling API executable (target: ${targetPlatform})...`);
  
  const outputPath = join(DIST_DIR, 'vpsos-api');
  
  if (targetPlatform === 'bun') {
    // Create standalone Bun executable
    await $`bun build --compile --target=bun apps/api/src/index.ts --outfile ${outputPath}`;
  } else {
    // For Node.js target, we create a bundle instead
    await $`bun build apps/api/src/index.ts --outfile ${outputPath}.js --target=node`;
    writeFileSync(outputPath, `#!/usr/bin/env node\nrequire('./vpsos-api.js')`, 'utf-8');
    await $`chmod +x ${outputPath}`;
  }
  
  console.log(`✅ API executable: ${outputPath}`);
}

async function createLauncherScripts() {
  console.log('📝 Creating launcher scripts...');
  
  const pkgDir = join(DIST_DIR, 'vpsos');
  mkdirSync(pkgDir, { recursive: true });
  
  // Copy files
  cpSync(join(DIST_DIR, 'vpsos-api'), join(pkgDir, 'vpsos-api'));
  cpSync(join(DIST_DIR, 'web'), join(pkgDir, 'web'), { recursive: true });
  
  // Bash launcher
  const bashScript = `#!/bin/bash
# VPSos Launcher
# Web-native workspace for your VPS

set -e

# Configuration
export NODE_ENV=production
export PORT="\${PORT:-3000}"
export HOST="\${HOST:-0.0.0.0}"

# Get script directory
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for .env file
if [ -f .env ]; then
  echo "📄 Loading environment from .env"
  set -a
  source .env
  set +a
fi

echo "🚀 Starting VPSos..."
echo "   API: http://\${HOST}:\${PORT}"
echo ""

exec ./vpsos-api "$@"
`;
  
  writeFileSync(join(pkgDir, 'vpsos'), bashScript, 'utf-8');
  await $`chmod +x ${join(pkgDir, 'vpsos')}`;
  
  // Windows batch launcher
  const batchScript = `@echo off
:: VPSos Launcher for Windows
setlocal EnableDelayedExpansion

set NODE_ENV=production
set PORT=3000
set HOST=0.0.0.0

:: Load .env if exists
if exist .env (
  echo Loading environment from .env
  for /f "tokens=*" %%a in (.env) do set %%a
)

echo Starting VPSos...
echo API: http://%HOST%:%PORT%
echo.

vpsos-api.exe %*
`;
  
  writeFileSync(join(pkgDir, 'vpsos.bat'), batchScript, 'utf-8');
  
  // README for the package
  const readme = `# VPSos

Web-native workspace for your VPS.

## Quick Start

1. Set your environment variables (or create a .env file):
   - AUTH_TOKEN (required): Secret for authentication
   - FS_ROOT (optional): Filesystem root path
   - DEFAULT_CWD (optional): Default working directory
   - PORT (optional): Server port (default: 3000)

2. Run:
   ./vpsos

3. Open http://localhost:3000 in your browser

## Configuration

Create a .env file in this directory:

AUTH_TOKEN=your-secret-token
FS_ROOT=/home/user
DEFAULT_CWD=/home/user/projects
PORT=3000

## Links

- GitHub: https://github.com/alexintosh/vpsos
- Website: https://alexintosh.github.io/vpsos
`;
  
  writeFileSync(join(pkgDir, 'README.txt'), readme, 'utf-8');
  
  console.log(`✅ Package ready: ${pkgDir}/`);
  console.log('   Run: ./dist/vpsos/vpsos');
}

async function buildAll() {
  const options: BuildOptions = {
    web: true,
    api: true,
    package: true
  };
  
  await clean();
  
  if (options.web) await buildWeb();
  if (options.api) await compileAPI(platform);
  if (options.package) await createLauncherScripts();
  
  console.log('');
  console.log('✨ Build complete!');
  console.log('');
  console.log('Output:');
  console.log('  dist/vpsos/          - Full package');
  console.log('  dist/vpsos-api       - API executable');
  console.log('  dist/web/            - Static web assets');
  console.log('');
  console.log('To run:');
  console.log('  ./dist/vpsos/vpsos');
}

// CLI
const command = process.argv[2] || 'all';

switch (command) {
  case 'clean':
    clean();
    break;
  case 'web':
    buildWeb();
    break;
  case 'api':
    compileAPI(platform);
    break;
  case 'package':
    createLauncherScripts();
    break;
  case 'all':
  default:
    buildAll();
    break;
}
