# ════════════════════════════════════════════════════════════════
#  ClipBridge – Test Demonstration Script
#  Runs: Jest unit → Jest+Supertest integration → Cypress E2E
# ════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot

function Section($title) {
  Write-Host ""
  Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
  Write-Host "  $title" -ForegroundColor Cyan
  Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
  Write-Host ""
}

# ── 1. Jest unit tests ──────────────────────────────────────────
Section "1 / 3   JEST UNIT TESTS  (40 tests, no DB needed)"
Set-Location "$root\backend"
npm run test:unit
$unitExit = $LASTEXITCODE

# ── 2. Jest + Supertest integration tests ───────────────────────
Section "2 / 3   JEST + SUPERTEST INTEGRATION TESTS  (40 tests, live PostgreSQL)"
npm run test:integration
$intExit = $LASTEXITCODE

# ── 3. Cypress E2E tests ────────────────────────────────────────
Section "3 / 3   CYPRESS E2E TESTS  (16 tests, against live Render site)"
Set-Location "$root\cypress"
npx cypress run --headless
$cyExit = $LASTEXITCODE

# ── Summary ─────────────────────────────────────────────────────
Section "FINAL SUMMARY"

function Status($name, $code) {
  if ($code -eq 0) {
    Write-Host ("  {0,-40} PASSED" -f $name) -ForegroundColor Green
  } else {
    Write-Host ("  {0,-40} FAILED  (exit {1})" -f $name, $code) -ForegroundColor Red
  }
}

Status "Jest unit tests"            $unitExit
Status "Jest + Supertest integration" $intExit
Status "Cypress E2E"                $cyExit

Set-Location $root
Write-Host ""
