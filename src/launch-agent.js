import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appDir, ensureAppDir, logPath } from './config.js';

const label = 'com.local-process.lps';
const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgentsDir, `${label}.plist`);

function plistEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function getLaunchAgentPath() {
  return plistPath;
}

export function writeLaunchAgent({ nodePath, cliPath }) {
  ensureAppDir();
  fs.mkdirSync(launchAgentsDir, { recursive: true });

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${plistEscape(nodePath)}</string>
    <string>${plistEscape(cliPath)}</string>
    <string>serve</string>
    <string>--startup</string>
    <string>--no-open</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${plistEscape(appDir)}</string>
  <key>StandardOutPath</key>
  <string>${plistEscape(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(logPath)}</string>
</dict>
</plist>
`;

  fs.writeFileSync(plistPath, plist);
  return plistPath;
}

export function enableLaunchAgent({ nodePath, cliPath }) {
  writeLaunchAgent({ nodePath, cliPath });
  spawnSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
  const result = spawnSync('launchctl', ['load', plistPath], { stdio: 'ignore' });
  return result.status === 0;
}

export function disableLaunchAgent() {
  spawnSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
  }
}

export function isLaunchAgentInstalled() {
  return fs.existsSync(plistPath);
}
