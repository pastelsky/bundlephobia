#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VERSION=$(tr -d '\r\n' < "$SCRIPT_DIR/VERSION")
MACHINE=$(uname -m)

case "$MACHINE" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *)
    echo "Unsupported VictoriaMetrics architecture: $MACHINE" >&2
    exit 1
    ;;
esac

ASSET="victoria-metrics-linux-$ARCH-$VERSION.tar.gz"
BASE_URL="https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/$VERSION"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM

curl --fail --location --silent --show-error \
  "$BASE_URL/$ASSET" \
  --output "$TEMP_DIR/$ASSET"
curl --fail --location --silent --show-error \
  "$BASE_URL/${ASSET%.tar.gz}_checksums.txt" \
  --output "$TEMP_DIR/checksums.txt"

EXPECTED=$(awk -v asset="$ASSET" '$2 == asset || $2 == "*" asset { print $1 }' "$TEMP_DIR/checksums.txt")
if [ -z "$EXPECTED" ]; then
  echo "No checksum found for $ASSET" >&2
  exit 1
fi
printf '%s  %s\n' "$EXPECTED" "$TEMP_DIR/$ASSET" | sha256sum --check --status

tar -xzf "$TEMP_DIR/$ASSET" -C "$TEMP_DIR"
install -o root -g root -m 0755 \
  "$TEMP_DIR/victoria-metrics-prod" \
  /usr/local/bin/victoria-metrics-prod
/usr/local/bin/victoria-metrics-prod --version
