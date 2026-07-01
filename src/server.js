import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAiStatus } from './ai.js';
import { pidPath, readConfig } from './config.js';
import { killProcess, listProcesses, openUrl } from './processes.js';
import {
  checkForUpdates,
  getCachedUpdateStatus,
  installLatestUpdate,
  restartIntoUpdatedApp
} from './updater.js';
import {
  getStartupCommandStatus,
  runStartupCommands
} from './startup-commands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
let updateInProgress = false;
let autoUpdateTimer = null;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendStatic(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requestedPath));

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(response);
}

async function handleApi(request, response, config) {
  const url = new URL(request.url, `http://${config.host}:${config.port}`);

  if (request.method === 'GET' && url.pathname === '/api/state') {
    const [processes, ai] = await Promise.all([listProcesses(config), getAiStatus(config)]);
    sendJson(response, 200, {
      processes: {
        all: processes.all,
        updatedAt: processes.updatedAt
      },
      ai,
      update: getCachedUpdateStatus(config),
      startup: getStartupCommandStatus(config),
      config: {
        language: config.language,
        refreshIntervalMs: config.refreshIntervalMs,
        autoStart: config.autoStart,
        autoUpdate: config.autoUpdate,
        showAiStatus: config.showAiStatus,
        developerProcessPatterns: config.developerProcessPatterns
      }
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/update/check') {
    const status = await checkForUpdates(config);
    sendJson(response, 200, status);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/update/apply') {
    if (updateInProgress) {
      sendJson(response, 409, { error: 'Update is already in progress.' });
      return;
    }

    updateInProgress = true;
    sendJson(response, 202, { ok: true, message: 'Update started. Local Process will restart.' });

    setTimeout(async () => {
      try {
        const result = await installLatestUpdate(readConfig());
        updateInProgress = false;
        if (result.installed) {
          try {
            fs.unlinkSync(pidPath);
          } catch {
            // The pid file may already be gone.
          }
          restartIntoUpdatedApp({ open: true });
          process.exit(0);
        }
      } catch (error) {
        updateInProgress = false;
        console.error(error.stack || error.message);
      }
    }, 100);
    return;
  }

  const killMatch = url.pathname.match(/^\/api\/processes\/(\d+)\/kill$/);
  if (request.method === 'POST' && killMatch) {
    const body = await readRequestJson(request);
    const signal = body.signal === 'KILL' ? 'SIGKILL' : 'SIGTERM';
    killProcess(Number(killMatch[1]), signal);
    sendJson(response, 200, {
      ok: true,
      pid: Number(killMatch[1]),
      signal
    });
    return;
  }

  sendJson(response, 404, { error: 'Unknown API route' });
}

export function createServer(config = readConfig()) {
  return http.createServer(async (request, response) => {
    try {
      if (request.url.startsWith('/api/')) {
        await handleApi(request, response, readConfig());
        return;
      }
      sendStatic(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error.message || 'Internal server error'
      });
    }
  });
}

export function startServer(config = readConfig(), options = {}) {
  const server = createServer(config);

  server.listen(config.port, config.host, () => {
    fs.writeFileSync(pidPath, `${process.pid}\n`);
    const url = `http://${config.host}:${config.port}`;
    console.log(`Local Process: ${url}`);
    if (options.openBrowser ?? config.openBrowserOnStart) {
      openUrl(url);
    }
    startUpdateChecks(config);
    if (options.runStartupCommands) {
      runStartupCommands(readConfig()).catch((error) => {
        console.error(error.stack || error.message);
      });
    }
  });

  const shutdown = () => {
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // The pid file may already be gone.
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

function startUpdateChecks(config) {
  clearInterval(autoUpdateTimer);

  if (!config.autoUpdate) {
    checkForUpdates(config).catch((error) => {
      console.error(error.message || error);
    });
    return;
  }

  setTimeout(() => {
    runAutoUpdateCycle().catch((error) => {
      console.error(error.stack || error.message);
    });
  }, 15000);

  const interval = Math.max(60 * 60 * 1000, Number(config.updateCheckIntervalMs) || 6 * 60 * 60 * 1000);
  autoUpdateTimer = setInterval(() => {
    runAutoUpdateCycle().catch((error) => {
      console.error(error.stack || error.message);
    });
  }, interval);
}

async function runAutoUpdateCycle() {
  if (updateInProgress) {
    return;
  }

  updateInProgress = true;
  try {
    const status = await checkForUpdates(readConfig());
    if (status.updateAvailable) {
      const result = await installLatestUpdate(readConfig());
      if (result.installed) {
        try {
          fs.unlinkSync(pidPath);
        } catch {
          // The pid file may already be gone.
        }
        restartIntoUpdatedApp({ open: false });
        process.exit(0);
      }
    }
  } finally {
    updateInProgress = false;
  }
}
