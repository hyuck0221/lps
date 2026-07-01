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

APP_DIR="${HOME}/.local-process/app"
BIN_DIR="${HOME}/.local/bin"
RELEASE_REPOSITORY="${LPS_REPO:-__LPS_RELEASE_REPOSITORY__}"

if [[ "${RELEASE_REPOSITORY}" == "__LPS_RELEASE_REPOSITORY__" || -z "${RELEASE_REPOSITORY}" ]]; then
  RELEASE_REPOSITORY="hyuck0221/lps"
fi

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
SCRIPT_DIR=""
if [[ -n "${SCRIPT_PATH}" && -f "${SCRIPT_PATH}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
fi

download_release_source() {
  local temp_dir latest_url tag version archive_url archive_path extract_dir
  temp_dir="$(mktemp -d)"
  archive_path="${temp_dir}/local-process.tar.gz"
  extract_dir="${temp_dir}/extract"
  mkdir -p "${extract_dir}"

  latest_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${RELEASE_REPOSITORY}/releases/latest")"
  tag="${latest_url##*/}"
  version="${tag#v}"

  if [[ -z "${tag}" || "${tag}" == "latest" || "${version}" == "${tag}" ]]; then
    echo "Could not resolve latest release tag for ${RELEASE_REPOSITORY}." >&2
    exit 1
  fi

  archive_url="https://github.com/${RELEASE_REPOSITORY}/releases/download/${tag}/local-process-${version}.tar.gz"

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
if [[ -z "${SOURCE_DIR}" || ! -f "${SOURCE_DIR}/package.json" ]]; then
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
