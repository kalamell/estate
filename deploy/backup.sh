#!/bin/sh
# สำรองฐานข้อมูล (แบบปลอดภัยขณะระบบทำงาน) + ไฟล์อัปโหลด + กุญแจเข้ารหัส
set -eu
STAMP=$(date +%Y%m%d-%H%M)
DEST=/backups/$STAMP
mkdir -p "$DEST"
sqlite3 /data/estate.db ".backup '$DEST/estate.db'"
sqlite3 "$DEST/estate.db" "PRAGMA integrity_check;" | grep -q '^ok$'
[ -d /data/uploads ] && tar -czf "$DEST/uploads.tar.gz" -C /data uploads
[ -f /data/secret.key ] && cp /data/secret.key "$DEST/secret.key" && chmod 600 "$DEST/secret.key"
find /backups -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_KEEP_DAYS:-14}" -exec rm -rf {} +
echo "$(date '+%F %T') backup ok: $DEST"
