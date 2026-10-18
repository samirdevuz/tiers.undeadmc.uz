#!/usr/bin/env bash
#
# SQLite bazasining zaxira nusxasi: $DATA_DIR/backups/tiers-YYYY-MM-DD_HHMM.db.gz
# (DATA_DIR berilmasa — ./data). Server ishlab turganda ham xavfsiz (SQLite online backup API).
#
#   bash scripts/backup.sh
#
# Eslatma: server o'zi ham har BACKUP_INTERVAL_HOURS soatda (standart 24) avtomatik nusxa oladi,
# shuning uchun cron shart emas. VPS da qo'shimcha nusxa kerak bo'lsa (crontab -e):
#   0 4 * * * cd /var/www/undeadmc-tiers && bash scripts/backup.sh >> data/backups/backup.log 2>&1
#
# Eski nusxalar BACKUP_KEEP_DAYS kundan keyin o'chiriladi (standart 30).

set -euo pipefail

cd "$(dirname "$0")/.."
exec node scripts/backup.js
