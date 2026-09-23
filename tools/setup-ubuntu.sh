#!/usr/bin/env bash
set -euo pipefail

# Ubuntu 26.04 x86_64 companion to setup-windows.cmd. No third-party apt source is added.
check_only=false
tools_only=false
skip_browser=false
for option in "$@"; do
  case "$option" in
    --check) check_only=true ;;
    --tools-only) tools_only=true ;;
    --skip-browser) skip_browser=true ;;
    *) echo "Usage: $0 [--check] [--tools-only] [--skip-browser]" >&2; exit 2 ;;
  esac
done

source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 26.04 || "$(uname -m)" != x86_64 ]]; then
  echo 'This setup supports Ubuntu 26.04 on x86_64.' >&2
  exit 1
fi

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
opt_root="$HOME/.local/opt"
local_bin="$HOME/.local/bin"
java8_home="$opt_root/temurin-8u504-b01"
java21_home="$opt_root/temurin-21.0.11+10"
node_home="$opt_root/node-v24.19.0-linux-x64"
gcloud_home="$opt_root/google-cloud-sdk"
export PATH="$node_home/bin:$gcloud_home/bin:$local_bin:$PATH"

native_command() {
  local found
  found=$(command -v "$1" 2>/dev/null) || return 1
  case "$found" in /mnt/[a-zA-Z]/*) return 1 ;; esac
  printf '%s\n' "$found"
}

show_status() {
  printf 'Ubuntu: %s; architecture: %s\n' "$PRETTY_NAME" "$(uname -m)"
  for tool in git gh pwsh node npm firebase gcloud az docker; do
    if native_command "$tool" >/dev/null; then
      printf '%-12s %s\n' "$tool" "$(native_command "$tool")"
    else
      printf '%-12s missing\n' "$tool"
    fi
  done
  for path in "$java8_home/bin/java" "$java21_home/bin/java"; do
    if [[ -f "$path" ]]; then printf 'ready: %s\n' "$path"; else printf 'missing: %s\n' "$path"; fi
  done
  case "$repo_root" in
    /mnt/[a-zA-Z]/*) printf 'Project toolchain: use a separate Ubuntu checkout under ~/src.\n' ;;
    *)
      path="$repo_root/.tools/apache-maven-3.9.9/bin/mvn"
      if [[ -f "$path" ]]; then printf 'ready: %s\n' "$path"; else printf 'missing: %s\n' "$path"; fi
      ;;
  esac
  printf 'Docker Desktop WSL integration must be enabled separately in Windows.\n'
}

if "$check_only"; then
  show_status
  exit 0
fi

case "$repo_root" in
  /mnt/[a-zA-Z]/*)
    if ! "$tools_only"; then
      echo 'Use a separate checkout under the Ubuntu home directory for project setup. Run --tools-only from /mnt/c, then clone into ~/src/fumbbl-rebuild.' >&2
      exit 1
    fi
    ;;
esac

if [[ "$EUID" -eq 0 ]]; then
  sudo_cmd=()
else
  command -v sudo >/dev/null || { echo 'sudo is required for Ubuntu packages.' >&2; exit 1; }
  sudo_cmd=(sudo)
fi

"${sudo_cmd[@]}" apt-get update
"${sudo_cmd[@]}" apt-get install -y ca-certificates curl git unzip xz-utils tar jq build-essential python3 python3-venv

temp_dir=$(mktemp -d)
trap 'rm -rf -- "$temp_dir"' EXIT
mkdir -p "$opt_root" "$local_bin"

download() {
  local url=$1 destination=$2
  curl --fail --location --retry 3 --output "$destination" "$url"
}

verify_sha256() {
  local file=$1 hash=$2
  printf '%s  %s\n' "$hash" "$file" | sha256sum --check --status || {
    echo "SHA256 mismatch: $file" >&2
    return 1
  }
}

install_deb() {
  local command=$1 url=$2 hash=${3:-}
  if native_command "$command" >/dev/null; then return; fi
  local file="$temp_dir/$command.deb"
  download "$url" "$file"
  if [[ -n "$hash" ]]; then verify_sha256 "$file" "$hash"; fi
  "${sudo_cmd[@]}" apt-get install -y "$file"
}

install_jdk() {
  local destination=$1 url=$2
  if [[ -x "$destination/bin/java" ]]; then return; fi
  if [[ -e "$destination" ]]; then
    echo "Incomplete JDK directory: $destination. Move it aside and rerun." >&2
    return 1
  fi
  local archive="$temp_dir/$(basename "$url")"
  local checksum="$archive.sha256.txt"
  local unpack="$temp_dir/unpack-$(basename "$destination")"
  download "$url" "$archive"
  download "$url.sha256.txt" "$checksum"
  local hash
  read -r hash _ < "$checksum"
  [[ "$hash" =~ ^[[:xdigit:]]{64}$ ]] || { echo "Invalid vendor SHA256 file: $checksum" >&2; return 1; }
  verify_sha256 "$archive" "$hash"
  mkdir -p "$unpack"
  tar -xzf "$archive" -C "$unpack"
  local extracted
  extracted=$(find "$unpack" -mindepth 1 -maxdepth 1 -type d -print -quit)
  [[ -n "$extracted" && -x "$extracted/bin/java" ]] || { echo "Invalid JDK archive: $archive" >&2; return 1; }
  mv -- "$extracted" "$destination"
}

install_deb pwsh \
  'https://github.com/PowerShell/PowerShell/releases/download/v7.6.6/powershell_7.6.6-1.deb_amd64.deb' \
  '9585f38ab5a026c3fc0995486e26e12050777960fef47a22dca98b577c5d27a7'
install_deb gh \
  'https://github.com/cli/cli/releases/download/v2.101.0/gh_2.101.0_linux_amd64.deb' \
  'f876a3b87bf67c94f773d17becca4dc7340b056dab901473a9260ee2a73e237b'

install_jdk "$java8_home" \
  'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u504-b01/OpenJDK8U-jdk_x64_linux_hotspot_8u504b01.tar.gz'
install_jdk "$java21_home" \
  'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11+10/OpenJDK21U-jdk_x64_linux_hotspot_21.0.11_10.tar.gz'

if [[ ! -x "$node_home/bin/node" ]]; then
  archive="$temp_dir/node.tar.xz"
  download 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz' "$archive"
  verify_sha256 "$archive" '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647'
  tar -xJf "$archive" -C "$opt_root"
fi

install_deb az \
  'https://packages.microsoft.com/repos/azure-cli/pool/main/a/azure-cli/azure-cli_2.90.0-1~resolute_amd64.deb'

if [[ ! -x "$gcloud_home/bin/gcloud" ]]; then
  archive="$temp_dir/google-cloud-cli.tar.gz"
  download 'https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz' "$archive"
  verify_sha256 "$archive" 'c1cd1823624a33f2341d0d384aafe2d7b24c1b77c9b131087d772ee0791ff2be'
  tar -xzf "$archive" -C "$opt_root"
fi

if ! native_command firebase >/dev/null; then
  npm_config_prefix="$HOME/.local" npm install --global firebase-tools
fi

profile_line='export PATH="$HOME/.local/opt/node-v24.19.0-linux-x64/bin:$HOME/.local/opt/google-cloud-sdk/bin:$HOME/.local/bin:$PATH"'
if ! grep -Fq '# fumbbl-rebuild WSL toolchain' "$HOME/.bashrc" 2>/dev/null; then
  printf '\n# fumbbl-rebuild WSL toolchain\n%s\n' "$profile_line" >> "$HOME/.bashrc"
fi

if ! "$tools_only"; then
  pwsh -NoProfile -File "$repo_root/tools/bootstrap.ps1" -JavaHome "$java8_home"
  pwsh -NoProfile -File "$repo_root/tools/build.ps1" info
  pwsh -NoProfile -File "$repo_root/tools/target-build.ps1" info -JavaHome "$java21_home"
  npm ci --prefix "$repo_root/browser-client"
  if ! "$skip_browser"; then
    "$repo_root/browser-client/node_modules/.bin/playwright" install --with-deps chromium
  fi
fi

show_status
echo 'Open a new Ubuntu shell to load the updated PATH. Enable Docker Desktop WSL integration for Ubuntu-26.04 in Windows.'
