#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Local Process currently supports macOS only." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required. Install Node.js, then run this installer again." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [[ "${NODE_MAJOR}" -lt 18 ]]; then
  echo "Node.js 18 or newer is required. Current version: $(node --version)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${HOME}/.local-process/app"
BIN_DIR="${HOME}/.local/bin"
RELEASE_REPOSITORY="${LPS_REPO:-__LPS_RELEASE_REPOSITORY__}"

download_release_source() {
  if [[ "${RELEASE_REPOSITORY}" == "__LPS_RELEASE_REPOSITORY__" || -z "${RELEASE_REPOSITORY}" ]]; then
    echo "This installer was not bundled with a GitHub repository." >&2
    echo "Run from a local checkout, or set LPS_REPO=owner/repo before running it." >&2
    exit 1
  fi

  local temp_dir archive_url archive_path extract_dir
  temp_dir="$(mktemp -d)"
  archive_path="${temp_dir}/local-process.tar.gz"
  extract_dir="${temp_dir}/extract"
  mkdir -p "${extract_dir}"

  archive_url="$(LPS_REPO="${RELEASE_REPOSITORY}" node <<'NODE'
const repo = process.env.LPS_REPO;
const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
  headers: {
    accept: 'application/vnd.github+json',
    'user-agent': 'local-process-installer'
  }
});
if (!response.ok) {
  throw new Error(`GitHub responded with ${response.status}`);
}
const release = await response.json();
const asset = (release.assets || []).find((item) => /^local-process-.+\.tar\.gz$/.test(item.name));
if (!asset) {
  throw new Error('Release archive was not found.');
}
process.stdout.write(asset.browser_download_url);
NODE
)"

  curl -fsSL "${archive_url}" -o "${archive_path}"
  tar -xzf "${archive_path}" -C "${extract_dir}"

  if [[ -f "${extract_dir}/package.json" ]]; then
    printf '%s\n' "${extract_dir}"
    return
  fi

  local package_file
  package_file="$(find "${extract_dir}" -mindepth 1 -maxdepth 2 -name package.json -print -quit)"
  if [[ -z "${package_file}" ]]; then
    echo "Downloaded release archive does not contain package.json." >&2
    exit 1
  fi
  dirname "${package_file}"
}

SOURCE_DIR="${SCRIPT_DIR}"
if [[ ! -f "${SOURCE_DIR}/package.json" ]]; then
  SOURCE_DIR="$(download_release_source)"
fi

mkdir -p "${APP_DIR}" "${BIN_DIR}"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude ".git" \
    --exclude ".idea" \
    --exclude "*.iml" \
    --exclude "node_modules" \
    "${SOURCE_DIR}/" "${APP_DIR}/"
else
  rm -rf "${APP_DIR}"
  mkdir -p "${APP_DIR}"
  cp -R "${SOURCE_DIR}/." "${APP_DIR}/"
  rm -rf "${APP_DIR}/.git" "${APP_DIR}/.idea" "${APP_DIR}/node_modules"
  find "${APP_DIR}" -maxdepth 1 -name "*.iml" -delete
fi

chmod +x "${APP_DIR}/bin/lps.js"
ln -sf "${APP_DIR}/bin/lps.js" "${BIN_DIR}/lps"

echo "Local Process installed."
echo "Binary: ${BIN_DIR}/lps"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *)
    echo "Add this to your shell profile if lps is not found:"
    echo "  export PATH=\"${BIN_DIR}:\$PATH\""
    ;;
esac

echo "Run: lps"
