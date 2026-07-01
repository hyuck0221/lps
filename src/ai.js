import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const aiDefinitions = {
  codex: {
    label: 'Codex',
    commands: ['codex'],
    authFiles: ['.codex/auth.json', '.codex/accounts']
  },
  claude: {
    label: 'Claude',
    commands: ['claude'],
    authFiles: ['.claude.json', '.claude']
  },
  antigravity: {
    label: 'Antigravity',
    commands: ['agy', 'antigravity'],
    authFiles: ['.antigravity', '.config/antigravity', 'Library/Application Support/Antigravity']
  }
};

async function resolveCommand(commands) {
  for (const command of commands) {
    const quoted = command.replaceAll("'", "'\\''");
    try {
      const { stdout } = await execFileAsync('zsh', ['-lc', `command -v '${quoted}'`], {
        timeout: 1500
      });
      const resolved = stdout.trim();
      if (resolved) {
        return { command, path: resolved };
      }
    } catch {
      // Try the next command alias.
    }
  }
  return { command: commands[0], path: '' };
}

function collectJsonFiles(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return [];
  }
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }
  return fs
    .readdirSync(targetPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .slice(0, 12)
    .map((entry) => path.join(targetPath, entry.name));
}

function findUserInValue(value, key = '') {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    if (/email|user(name)?|name|login/i.test(key) && value.length < 120) {
      return value;
    }
    return '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUserInValue(item);
      if (found) {
        return found;
      }
    }
    return '';
  }
  if (typeof value === 'object') {
    const preferredKeys = ['email', 'username', 'userName', 'name', 'displayName', 'login', 'userID', 'userId'];
    for (const preferredKey of preferredKeys) {
      const found = findUserInValue(value[preferredKey], preferredKey);
      if (found) {
        return found;
      }
    }
    for (const [childKey, childValue] of Object.entries(value)) {
      if (/token|secret|key|credential|session/i.test(childKey)) {
        continue;
      }
      const found = findUserInValue(childValue, childKey);
      if (found) {
        return found;
      }
    }
  }
  return '';
}

function getLoginUser(definition) {
  for (const relativePath of definition.authFiles || []) {
    const absolutePath = path.join(os.homedir(), relativePath);
    for (const filePath of collectJsonFiles(absolutePath)) {
      try {
        const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const user = findUserInValue(json);
        if (user) {
          return user;
        }
        if (Object.keys(json).length) {
          return 'signed in';
        }
      } catch {
        // Ignore unreadable or non-JSON files.
      }
    }

    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
      return 'signed in';
    }
  }
  return '';
}

async function commandVersion(command) {
  try {
    const { stdout } = await execFileAsync(command, ['--version'], {
      timeout: 1500
    });
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function getAiStatus(config) {
  if (!config.showAiStatus) {
    return [];
  }

  const entries = await Promise.all(
    Object.entries(aiDefinitions).map(async ([id, definition]) => {
      const enabled = config.aiTools[id] !== false;
      const resolved = enabled ? await resolveCommand(definition.commands) : { command: definition.commands[0], path: '' };
      const user = resolved.path ? getLoginUser(definition) : '';
      const installed = Boolean(resolved.path);
      return {
        id,
        label: definition.label,
        command: resolved.command,
        enabled,
        installed,
        loggedIn: Boolean(user),
        status: installed ? (user ? 'ready' : 'login_required') : 'uninstalled',
        user,
        version: installed ? await commandVersion(resolved.path) : '',
        path: resolved.path
      };
    })
  );

  return entries.filter((entry) => entry.enabled);
}
