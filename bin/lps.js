#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readConfig, isConfigured, pidPath, updateConfig } from '../src/config.js';
import { disableLaunchAgent, enableLaunchAgent, getLaunchAgentPath, isLaunchAgentInstalled } from '../src/launch-agent.js';
import { openUrl } from '../src/processes.js';
import { runSettingsFlow } from '../src/cli-ui.js';
import { startServer } from '../src/server.js';
import {
  checkForUpdates,
  getCachedUpdateStatus,
  getCurrentVersion,
  installLatestUpdate,
  restartIntoUpdatedApp
} from '../src/updater.js';
import {
  deleteStartupCommand,
  getStartupCommandStatus,
  sanitizeStartupCommands,
  upsertStartupCommand
} from '../src/startup-commands.js';
import {
  configureLocalhostProxy,
  getLocalhostProxyStatus,
  removeLocalhostProxy
} from '../src/nginx.js';

const cliPath = fileURLToPath(import.meta.url);
const nodePath = process.execPath;

function urlFor(config = readConfig()) {
  return `http://${config.host}:${config.port}`;
}

function readPid() {
  try {
    return Number(fs.readFileSync(pidPath, 'utf8').trim());
  } catch {
    return 0;
  }
}

function isProcessAlive(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startBackground({ open = true } = {}) {
  const existingPid = readPid();
  const config = readConfig();
  if (isProcessAlive(existingPid)) {
    if (open) {
      openUrl(urlFor(config));
    }
    console.log(`Local Process is already running: ${urlFor(config)}`);
    return;
  }

  const child = spawn(nodePath, [cliPath, 'serve', open ? '--open' : '--no-open'], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(path.dirname(cliPath))
  });
  child.unref();
  console.log(`Local Process starting: ${urlFor(config)}`);
}

function stopBackground() {
  const pid = readPid();
  if (!isProcessAlive(pid)) {
    console.log('Local Process is not running.');
    return;
  }
  process.kill(pid, 'SIGTERM');
  console.log(`Stopped Local Process (PID ${pid}).`);
}

function printStatus() {
  const config = readConfig();
  const pid = readPid();
  const running = isProcessAlive(pid);
  const update = getCachedUpdateStatus(config);
  console.log(`Local Process: ${running ? 'running' : 'stopped'}`);
  if (running) {
    console.log(`PID: ${pid}`);
    console.log(`URL: ${urlFor(config)}`);
  }
  console.log(`Version: ${update.currentVersion}`);
  if (update.latestVersion) {
    console.log(`Latest: ${update.latestVersion}${update.updateAvailable ? ' (update available)' : ''}`);
  }
  console.log(`Language: ${config.language}`);
  console.log(`Auto start: ${config.autoStart ? 'enabled' : 'disabled'}`);
  console.log(`Auto update: ${config.autoUpdate ? 'enabled' : 'disabled'}`);
  console.log(`LaunchAgent: ${isLaunchAgentInstalled() ? getLaunchAgentPath() : 'not installed'}`);
}

function parseStartupFields(values) {
  const fields = {};
  for (const value of values) {
    const index = value.indexOf('=');
    if (index === -1) {
      continue;
    }
    const key = value.slice(0, index);
    const raw = value.slice(index + 1);
    if (key === 'priority') {
      fields.priority = Number(raw);
    } else if (key === 'enabled') {
      fields.enabled = !['false', '0', 'no', 'off'].includes(raw.toLowerCase());
    } else if (['name', 'command', 'cwd'].includes(key)) {
      fields[key] = raw;
    }
  }
  return fields;
}

function printStartupCommands(config) {
  const status = getStartupCommandStatus(config);
  console.log(`Startup commands: ${status.enabled ? 'enabled' : 'disabled (enable autostart first)'}`);
  if (!status.commands.length) {
    console.log('No startup commands configured.');
    return;
  }
  for (const command of status.commands) {
    const latest = command.status
      ? `${command.status.status}${command.status.error ? ` (${command.status.error})` : ''}`
      : 'not run';
    console.log(`${command.id} | ${command.priority} | ${command.enabled ? 'on' : 'off'} | ${command.name} | ${latest}`);
    console.log(`  ${command.command}`);
    if (command.cwd) {
      console.log(`  cwd: ${command.cwd}`);
    }
  }
}

function printNginxStatus() {
  const status = getLocalhostProxyStatus();
  console.log(`Nginx: ${status.installed ? 'installed' : 'not installed'}`);
  console.log(`localhost proxy: ${status.enabled ? 'enabled' : 'disabled'}`);
  if (status.confPath) {
    console.log(`nginx.conf: ${status.confPath}`);
  }
  if (status.serverPath) {
    console.log(`LPS config: ${status.serverPath}`);
  }
  if (status.enabled) {
    console.log('URL: http://localhost');
  }
}

function ensureStartupManageable(config) {
  if (!config.autoStart) {
    console.log('Enable auto start first: lps autostart on');
    return false;
  }
  return true;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    if (!isConfigured()) {
      const saved = await runSettingsFlow({ initialSetup: true, nodePath, cliPath });
      if (!saved) {
        console.log('Setup cancelled.');
        return;
      }
    }
    startBackground({ open: true });
    return;
  }

  if (command === 'serve') {
    const config = readConfig();
    const open = args.includes('--open') || (!args.includes('--no-open') && config.openBrowserOnStart);
    startServer(config, { openBrowser: open, runStartupCommands: args.includes('--startup') });
    return;
  }

  if (command === 'start') {
    if (!isConfigured()) {
      await runSettingsFlow({ initialSetup: true, nodePath, cliPath });
    }
    startBackground({ open: !args.includes('--no-open') });
    return;
  }

  if (command === 'stop') {
    stopBackground();
    return;
  }

  if (command === 'restart') {
    stopBackground();
    setTimeout(() => startBackground({ open: !args.includes('--no-open') }), 500);
    return;
  }

  if (command === 'open') {
    openUrl(urlFor());
    return;
  }

  if (command === 'status') {
    printStatus();
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(getCurrentVersion());
    return;
  }

  if (command === 'update') {
    const action = args[0];
    const config = readConfig();
    if (action === 'check') {
      const status = await checkForUpdates(config);
      console.log(`Current: ${status.currentVersion}`);
      console.log(`Latest: ${status.latestVersion || 'unknown'}`);
      console.log(`Repository: ${status.repository || 'not configured'}`);
      console.log(`Update available: ${status.updateAvailable ? 'yes' : 'no'}`);
      if (status.lastUpdateError) {
        console.log(`Note: ${status.lastUpdateError}`);
      }
      return;
    }

    const result = await installLatestUpdate(config);
    if (!result.installed) {
      console.log(`Local Process is already up to date (${result.currentVersion}).`);
      if (result.lastUpdateError) {
        console.log(`Note: ${result.lastUpdateError}`);
      }
      return;
    }

    console.log(`Updated Local Process to ${result.latestVersion}. Restarting...`);
    stopBackground();
    restartIntoUpdatedApp({ open: !args.includes('--no-open') });
    return;
  }

  if (command === 'setting' || command === 'settings' || command === 'config') {
    await runSettingsFlow({ initialSetup: false, nodePath, cliPath });
    return;
  }

  if (command === 'startup') {
    const action = args[0] || 'list';
    const config = readConfig();

    if (action === 'list') {
      printStartupCommands(config);
      return;
    }

    if (!ensureStartupManageable(config)) {
      return;
    }

    if (action === 'add') {
      const [name, commandText, priority = '100', cwd = ''] = args.slice(1);
      if (!name || !commandText) {
        console.log('Usage: lps startup add "Name" "command" [priority] [cwd]');
        return;
      }
      const updated = upsertStartupCommand(config, {
        name,
        command: commandText,
        priority: Number(priority),
        cwd
      });
      printStartupCommands(updated);
      return;
    }

    if (action === 'edit') {
      const [id, ...fields] = args.slice(1);
      if (!id || !fields.length) {
        console.log('Usage: lps startup edit <id> name=... command=... priority=... cwd=... enabled=true');
        return;
      }
      const current = sanitizeStartupCommands(config.startupCommands).find((item) => item.id === id);
      if (!current) {
        console.log(`Startup command not found: ${id}`);
        return;
      }
      const updated = upsertStartupCommand(config, {
        ...current,
        ...parseStartupFields(fields),
        id
      });
      printStartupCommands(updated);
      return;
    }

    if (action === 'delete' || action === 'remove') {
      const id = args[1];
      if (!id) {
        console.log('Usage: lps startup delete <id>');
        return;
      }
      printStartupCommands(deleteStartupCommand(config, id));
      return;
    }

    if (action === 'enable' || action === 'disable') {
      const id = args[1];
      const current = sanitizeStartupCommands(config.startupCommands).find((item) => item.id === id);
      if (!id || !current) {
        console.log(`Startup command not found: ${id || ''}`);
        return;
      }
      printStartupCommands(
        upsertStartupCommand(config, {
          ...current,
          enabled: action === 'enable'
        })
      );
      return;
    }
  }

  if (command === 'nginx' || command === 'localhost') {
    const action = args[0] || 'status';
    if (action === 'status') {
      printNginxStatus();
      return;
    }
    if (action === 'on' || action === 'enable') {
      const paths = configureLocalhostProxy(readConfig());
      console.log('localhost proxy enabled: http://localhost');
      console.log(`Config: ${paths.serverPath}`);
      return;
    }
    if (action === 'off' || action === 'disable') {
      const paths = removeLocalhostProxy();
      console.log('localhost proxy disabled.');
      if (paths.serverPath) {
        console.log(`Removed: ${paths.serverPath}`);
      }
      return;
    }
  }

  if (command === 'autostart') {
    const action = args[0];
    if (action === 'on') {
      enableLaunchAgent({ nodePath, cliPath });
      updateConfig({ autoStart: true });
      console.log(`Auto start enabled: ${getLaunchAgentPath()}`);
      return;
    }
    if (action === 'off') {
      disableLaunchAgent();
      updateConfig({ autoStart: false });
      console.log('Auto start disabled.');
      return;
    }
  }

  console.log(`Usage:
  lps                 Run first-time setup if needed, then start GUI
  lps start           Start GUI in the background
  lps serve           Run GUI server in the foreground
  lps stop            Stop background GUI server
  lps restart         Restart background GUI server
  lps open            Open GUI in browser
  lps status          Show service status
  lps version         Print current version
  lps update check    Check GitHub Releases for the latest version
  lps update          Install latest version and restart
  lps setting         Configure language, auto start, and AI status
  lps startup list    List startup commands and latest result
  lps startup add "Name" "command" [priority] [cwd]
  lps startup edit <id> name=... command=... priority=... cwd=... enabled=true
  lps startup enable <id>
  lps startup disable <id>
  lps startup delete <id>
  lps nginx on        Proxy http://localhost to the LPS GUI
  lps nginx off       Remove the localhost proxy
  lps nginx status    Show localhost proxy status
  lps autostart on    Install macOS LaunchAgent
  lps autostart off   Remove macOS LaunchAgent`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
