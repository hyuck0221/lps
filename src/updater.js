import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { updateConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const packagePath = path.join(appRoot, 'package.json');
const releaseMetadataPath = path.join(appRoot, 'release.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function getCurrentVersion() {
  return readJson(packagePath)?.version || '0.0.0';
}

export function normalizeVersion(version) {
  return String(version || '').trim().replace(/^v/i, '');
}

export function compareVersions(a, b) {
  const left = normalizeVersion(a).split(/[.-]/);
  const right = normalizeVersion(b).split(/[.-]/);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const rawLeft = left[index] ?? '0';
    const rawRight = right[index] ?? '0';
    const leftNumber = Number(rawLeft);
    const rightNumber = Number(rawRight);

    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      if (leftNumber !== rightNumber) {
        return leftNumber > rightNumber ? 1 : -1;
      }
      continue;
    }

    const textComparison = rawLeft.localeCompare(rawRight);
    if (textComparison !== 0) {
      return textComparison > 0 ? 1 : -1;
    }
  }

  return 0;
}

function parseRepositoryUrl(repository) {
  const value = typeof repository === 'string' ? repository : repository?.url;
  if (!value) {
    return '';
  }

  const normalized = value
    .replace(/^git\+/, '')
    .replace(/^git@github.com:/, 'https://github.com/')
    .replace(/\.git$/, '');
  const match = normalized.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/);
  return match ? `${match[1]}/${match[2]}` : '';
}

export function resolveUpdateRepository(config = {}) {
  const releaseMetadata = readJson(releaseMetadataPath);
  const packageJson = readJson(packagePath);
  return (
    config.updateRepository ||
    process.env.LPS_UPDATE_REPO ||
    releaseMetadata?.repository ||
    parseRepositoryUrl(packageJson?.repository) ||
    ''
  );
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': `local-process/${getCurrentVersion()}`
        }
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          requestJson(response.headers.location).then(resolve, reject);
          return;
        }

        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub responded with ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.setTimeout(10000, () => request.destroy(new Error('Update check timed out')));
    request.on('error', reject);
  });
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'user-agent': `local-process/${getCurrentVersion()}`
        }
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          downloadFile(response.headers.location, destination).then(resolve, reject);
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Download failed with ${response.statusCode}`));
          return;
        }

        const output = fs.createWriteStream(destination);
        response.pipe(output);
        output.on('finish', () => {
          output.close(resolve);
        });
        output.on('error', reject);
      }
    );
    request.setTimeout(30000, () => request.destroy(new Error('Update download timed out')));
    request.on('error', reject);
  });
}

function findReleaseAsset(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return assets.find((asset) => /^local-process-.+\.tar\.gz$/.test(asset.name)) || null;
}

export function getCachedUpdateStatus(config = {}) {
  const currentVersion = getCurrentVersion();
  const latestVersion = config.latestVersion || '';
  return {
    currentVersion,
    latestVersion,
    updateAvailable:
      Boolean(latestVersion) &&
      !config.lastUpdateError &&
      compareVersions(latestVersion, currentVersion) > 0,
    repository: resolveUpdateRepository(config),
    lastUpdateCheck: config.lastUpdateCheck || '',
    lastUpdateError: config.lastUpdateError || ''
  };
}

export async function checkForUpdates(config = {}) {
  const repository = resolveUpdateRepository(config);
  if (!repository) {
    const status = {
      ...getCachedUpdateStatus(config),
      lastUpdateCheck: new Date().toISOString(),
      lastUpdateError: 'Update repository is not configured.'
    };
    updateConfig({
      lastUpdateCheck: status.lastUpdateCheck,
      lastUpdateError: status.lastUpdateError
    });
    return status;
  }

  try {
    const release = await requestJson(`https://api.github.com/repos/${repository}/releases/latest`);
    const latestVersion = normalizeVersion(release.tag_name || release.name);
    const asset = findReleaseAsset(release);
    const status = {
      currentVersion: getCurrentVersion(),
      latestVersion,
      updateAvailable: Boolean(asset) && compareVersions(latestVersion, getCurrentVersion()) > 0,
      repository,
      assetName: asset?.name || '',
      assetUrl: asset?.browser_download_url || '',
      releaseUrl: release.html_url || '',
      lastUpdateCheck: new Date().toISOString(),
      lastUpdateError: asset ? '' : 'Release asset was not found.'
    };
    updateConfig({
      latestVersion: status.latestVersion,
      lastUpdateCheck: status.lastUpdateCheck,
      lastUpdateError: status.lastUpdateError,
      updateRepository: repository
    });
    return status;
  } catch (error) {
    const status = {
      ...getCachedUpdateStatus(config),
      repository,
      lastUpdateCheck: new Date().toISOString(),
      lastUpdateError: error.message || 'Update check failed.'
    };
    updateConfig({
      lastUpdateCheck: status.lastUpdateCheck,
      lastUpdateError: status.lastUpdateError,
      updateRepository: repository
    });
    return status;
  }
}

function extractedRoot(directory) {
  if (fs.existsSync(path.join(directory, 'package.json'))) {
    return directory;
  }

  const candidates = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name))
    .filter((candidate) => fs.existsSync(path.join(candidate, 'package.json')));

  return candidates[0] || directory;
}

export async function installLatestUpdate(config = {}) {
  const status = await checkForUpdates(config);
  if (!status.updateAvailable) {
    return {
      ...status,
      installed: false
    };
  }

  if (!status.assetUrl) {
    throw new Error(status.lastUpdateError || 'No downloadable update asset was found.');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-process-update-'));
  const archivePath = path.join(tempDir, status.assetName || 'local-process-update.tar.gz');
  const extractDir = path.join(tempDir, 'extract');
  fs.mkdirSync(extractDir);

  await downloadFile(status.assetUrl, archivePath);

  const tarResult = spawnSync('tar', ['-xzf', archivePath, '-C', extractDir], {
    stdio: 'pipe'
  });
  if (tarResult.status !== 0) {
    throw new Error(tarResult.stderr?.toString().trim() || 'Could not extract update archive.');
  }

  const sourceRoot = extractedRoot(extractDir);
  const rsyncResult = spawnSync('rsync', ['-a', '--delete', `${sourceRoot}/`, `${appRoot}/`], {
    stdio: 'pipe'
  });
  if (rsyncResult.status !== 0) {
    throw new Error(rsyncResult.stderr?.toString().trim() || 'Could not install update files.');
  }

  spawnSync('chmod', ['+x', path.join(appRoot, 'bin', 'lps.js')], {
    stdio: 'ignore'
  });

  updateConfig({
    latestVersion: status.latestVersion,
    lastUpdateCheck: new Date().toISOString(),
    lastUpdateError: '',
    updateRepository: status.repository
  });

  return {
    ...status,
    installed: true
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function restartIntoUpdatedApp({ open = false } = {}) {
  const cliPath = path.join(appRoot, 'bin', 'lps.js');
  const openArg = open ? '--open' : '--no-open';
  const command = `sleep 1; ${shellQuote(process.execPath)} ${shellQuote(cliPath)} start ${openArg}`;
  const child = spawn('/bin/zsh', ['-lc', command], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}
