#!/bin/sh
set -eu

mc alias set source "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"

while true; do
  mc mirror --overwrite --remove "source/${S3_BUCKET}" /backups/current
  date -u +%s > /backups/last-success
  sleep 86400
done
