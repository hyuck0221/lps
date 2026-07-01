import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const marker = '# LPS localhost proxy include';
const serverFileName = 'lps-localhost.conf';

function commandOutput(command, args = []) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    return '';
  }
}

export function isNginxInstalled() {
  return Boolean(commandOutput('zsh', ['-lc', 'command -v nginx']));
}

function nginxPath() {
  return commandOutput('zsh', ['-lc', 'command -v nginx']);
}

function nginxVersionOutput() {
  try {
    return execFileSync('nginx', ['-V'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}`;
  }
}

export function detectNginxPaths() {
  const version = nginxVersionOutput();
  const confMatch = version.match(/--conf-path=([^\s]+)/);
  const confPath =
    confMatch?.[1] ||
    ['/opt/homebrew/etc/nginx/nginx.conf', '/usr/local/etc/nginx/nginx.conf', '/etc/nginx/nginx.conf'].find(
      (candidate) => fs.existsSync(candidate)
    ) ||
    '';
  const configDir = confPath ? path.dirname(confPath) : '';
  const serversDir = configDir ? path.join(configDir, 'servers') : '';
  const serverPath = serversDir ? path.join(serversDir, serverFileName) : '';

  return {
    nginxPath: nginxPath(),
    confPath,
    configDir,
    serversDir,
    serverPath
  };
}

function serverConfig(port) {
  return `server {
    listen 80;
    server_name localhost 127.0.0.1;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_pass http://127.0.0.1:${port};
    }
}
`;
}

function ensureNginxInclude(confPath) {
  const conf = fs.readFileSync(confPath, 'utf8');
  if (conf.includes('include servers/*.conf') || conf.includes('include servers/*')) {
    return false;
  }

  const httpIndex = conf.indexOf('http');
  const openIndex = conf.indexOf('{', httpIndex);
  const closeIndex = conf.lastIndexOf('}');
  if (httpIndex === -1 || openIndex === -1 || closeIndex === -1 || closeIndex < openIndex) {
    throw new Error(`Could not find http block in ${confPath}`);
  }

  const backupPath = `${confPath}.lps-backup`;
  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, conf);
  }

  const nextConf = `${conf.slice(0, closeIndex)}    ${marker}
    include servers/*.conf;
${conf.slice(closeIndex)}`;
  fs.writeFileSync(confPath, nextConf);
  return true;
}

function runSudoNginx(nginxBinary, args) {
  return spawnSync('sudo', [nginxBinary, ...args], {
    stdio: 'inherit'
  }).status === 0;
}

export function configureLocalhostProxy(config) {
  if (!isNginxInstalled()) {
    throw new Error('Nginx is not installed. Install it first with: brew install nginx');
  }

  const paths = detectNginxPaths();
  if (!paths.confPath || !fs.existsSync(paths.confPath)) {
    throw new Error('Could not find nginx.conf.');
  }

  fs.mkdirSync(paths.serversDir, { recursive: true });
  ensureNginxInclude(paths.confPath);
  fs.writeFileSync(paths.serverPath, serverConfig(config.port));

  if (!runSudoNginx(paths.nginxPath, ['-t'])) {
    throw new Error('Nginx configuration test failed.');
  }

  if (!runSudoNginx(paths.nginxPath, ['-s', 'reload'])) {
    if (!runSudoNginx(paths.nginxPath, [])) {
      throw new Error('Could not reload or start Nginx.');
    }
  }

  return paths;
}

export function removeLocalhostProxy() {
  const paths = detectNginxPaths();
  if (paths.serverPath && fs.existsSync(paths.serverPath)) {
    fs.unlinkSync(paths.serverPath);
  }

  if (isNginxInstalled()) {
    const nginxBinary = paths.nginxPath || nginxPath();
    runSudoNginx(nginxBinary, ['-t']);
    runSudoNginx(nginxBinary, ['-s', 'reload']);
  }

  return paths;
}

export function getLocalhostProxyStatus() {
  const paths = detectNginxPaths();
  return {
    installed: isNginxInstalled(),
    confPath: paths.confPath,
    serverPath: paths.serverPath,
    enabled: Boolean(paths.serverPath && fs.existsSync(paths.serverPath))
  };
}
