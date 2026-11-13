#!/usr/bin/env bash
# apply-host-tuning.sh
# Idempotently configures and verifies host-level kernel, storage, memory, and network tuning for Bundlephobia.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Bundlephobia Host Performance Tuning ==="

if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root." >&2
   exit 1
fi

# 1. Clean headless target (disable desktop environment if present)
echo "1. Configuring headless systemd target..."
systemctl set-default multi-user.target 2>/dev/null || true
if systemctl is-active --quiet gdm3 2>/dev/null; then
    echo "Stopping and disabling gdm3..."
    systemctl stop gdm3 2>/dev/null || true
    systemctl disable gdm3 2>/dev/null || true
fi
if systemctl is-active --quiet gnome-remote-desktop 2>/dev/null; then
    systemctl stop gnome-remote-desktop 2>/dev/null || true
    systemctl disable gnome-remote-desktop 2>/dev/null || true
fi

# 2. Kernel modules (BBR & lz4)
echo "2. Loading kernel modules..."
install -m 0644 "${SCRIPT_DIR}/modules-load.d/bundlephobia.conf" /etc/modules-load.d/bundlephobia.conf
modprobe tcp_bbr 2>/dev/null || true
modprobe lz4 2>/dev/null || true
modprobe lz4_compress 2>/dev/null || true

# 3. Sysctl parameters
echo "3. Applying kernel sysctl parameters..."
install -m 0644 "${SCRIPT_DIR}/sysctl.d/99-bundlephobia.conf" /etc/sysctl.d/99-bundlephobia.conf
sysctl --system >/dev/null

# 4. zswap configuration
echo "4. Setting up zswap service..."
install -m 0644 "${SCRIPT_DIR}/systemd/zswap-configure.service" /etc/systemd/system/zswap-configure.service
systemctl daemon-reload
systemctl enable --now zswap-configure.service

# 5. Remount /tmp/tmp-build with ephemeral performance flags
if mountpoint -q /tmp/tmp-build; then
    echo "5. Remounting /tmp/tmp-build with noatime,nodiratime,commit=60..."
    mount -o remount,noatime,nodiratime,commit=60 /tmp/tmp-build
fi

# 6. Verification
echo ""
echo "=== Verification ==="
echo "TCP Congestion: $(sysctl -n net.ipv4.tcp_congestion_control)"
echo "Default Qdisc:  $(sysctl -n net.core.default_qdisc)"
echo "Swappiness:     $(sysctl -n vm.swappiness)"
echo "VFS Pressure:   $(sysctl -n vm.vfs_cache_pressure)"
echo "zswap Enabled:  $(cat /sys/module/zswap/parameters/enabled 2>/dev/null || echo 'N/A')"
echo "zswap Compress: $(cat /sys/module/zswap/parameters/compressor 2>/dev/null || echo 'N/A')"
if mountpoint -q /tmp/tmp-build; then
    echo "Mount Options:  $(grep ' /tmp/tmp-build ' /proc/mounts | awk '{print $4}')"
fi
echo "Host tuning applied successfully."
