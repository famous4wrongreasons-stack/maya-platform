#!/bin/sh
set -eu

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RUNTIME_DIR=/opt/maya-shadow-observer
STATE_DIR=/var/lib/maya-shadow-observer
SERVICE=maya-organic-appointment-shadow-observer.service

if [ "$(id -u)" -ne 0 ]; then
  echo "install.sh must run as root" >&2
  exit 1
fi

if ! id maya-shadow-observer >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent \
    --shell /usr/sbin/nologin maya-shadow-observer
fi
usermod -a -G systemd-journal maya-shadow-observer

install -d -o root -g root -m 0755 "$RUNTIME_DIR"
install -d -o maya-shadow-observer -g maya-shadow-observer -m 0750 "$STATE_DIR"
install -o root -g root -m 0755 \
  "$SOURCE_DIR/legacy_appointment_shadow_observer.py" \
  "$RUNTIME_DIR/legacy_appointment_shadow_observer.py"
install -o root -g root -m 0644 \
  "$SOURCE_DIR/$SERVICE" "/etc/systemd/system/$SERVICE"

systemctl daemon-reload
systemctl enable --now "$SERVICE"
systemctl is-active --quiet "$SERVICE"

echo "installed: $SERVICE"
echo "summary: $STATE_DIR/summary.json"
