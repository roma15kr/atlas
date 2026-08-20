#!/bin/sh
set -eu

base_url="${ATLAS_URL:?ATLAS_URL is required}"
director_user="${ATLAS_DIRECTOR_USER:-director}"
director_password="${ATLAS_DIRECTOR_PASSWORD:?ATLAS_DIRECTOR_PASSWORD is required}"
employee_user="${ATLAS_EMPLOYEE_USER:-employee}"
employee_password="${ATLAS_EMPLOYEE_PASSWORD:?ATLAS_EMPLOYEE_PASSWORD is required}"
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT INT TERM

request() {
  curl --fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 "$@"
}

request "${base_url}/health" >/dev/null

director_json="$(request -c "${work_dir}/director.cookies" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg username "${director_user}" --arg password "${director_password}" '{username:$username,password:$password}')" \
  "${base_url}/api/v1/auth/login")"
director_token="$(printf '%s' "${director_json}" | jq -er '.data.accessToken')"

request -H "Authorization: Bearer ${director_token}" "${base_url}/api/v1/dashboard" | jq -e '.data.metrics' >/dev/null
request -H "Authorization: Bearer ${director_token}" "${base_url}/api/v1/clients/export.csv" >/dev/null

employee_json="$(request -c "${work_dir}/employee.cookies" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg username "${employee_user}" --arg password "${employee_password}" '{username:$username,password:$password}')" \
  "${base_url}/api/v1/auth/login")"
employee_token="$(printf '%s' "${employee_json}" | jq -er '.data.accessToken')"
denied_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --connect-timeout 10 --max-time 30 \
  -H "Authorization: Bearer ${employee_token}" \
  "${base_url}/api/v1/clients/export.csv")"
test "${denied_status}" = "403"

printf 'Atlas smoke test passed: health, director dashboard/export, employee export denial.\n'

