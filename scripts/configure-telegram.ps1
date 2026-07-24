param(
  [string]$WorkerUrl = 'https://nourish-api.sfrnuri.workers.dev',
  [string]$MiniAppUrl = 'https://calorie-tracker-bot.pages.dev'
)

$ErrorActionPreference = 'Stop'
$varsPath = Join-Path $PSScriptRoot '..\apps\worker\.dev.vars'
if (-not (Test-Path -LiteralPath $varsPath)) { throw "Missing $varsPath" }

$vars = Get-Content -LiteralPath $varsPath -Raw -Encoding utf8 | ConvertFrom-StringData
$token = [string]$vars.TELEGRAM_BOT_TOKEN
$secret = [string]$vars.TELEGRAM_WEBHOOK_SECRET
if ($token -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') {
  throw 'TELEGRAM_BOT_TOKEN is missing or malformed in apps/worker/.dev.vars'
}
if ($secret -notmatch '^[A-Za-z0-9_-]{1,256}$') {
  throw 'TELEGRAM_WEBHOOK_SECRET is missing or malformed in apps/worker/.dev.vars'
}

function Invoke-Telegram([string]$method, [hashtable]$body) {
  $response = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/$method" -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8)
  if (-not $response.ok) { throw "Telegram $method failed: $($response.description)" }
  return $response.result
}

$bot = Invoke-Telegram 'getMe' @{}
Invoke-Telegram 'setWebhook' @{ url = "$WorkerUrl/telegram/webhook"; secret_token = $secret; allowed_updates = @('message') } | Out-Null
Invoke-Telegram 'setChatMenuButton' @{ menu_button = @{ type = 'web_app'; text = 'Open Nourish'; web_app = @{ url = $MiniAppUrl } } } | Out-Null
Invoke-Telegram 'setMyCommands' @{ commands = @(
    @{ command = 'start'; description = 'Start Nourish' },
    @{ command = 'open'; description = 'Open the nutrition dashboard' },
    @{ command = 'help'; description = 'Show help' }
  ) } | Out-Null
Invoke-Telegram 'setMyCommands' @{ language_code = 'ru'; commands = @(
    @{ command = 'start'; description = 'Запустить Nourish' },
    @{ command = 'open'; description = 'Открыть дневник питания' },
    @{ command = 'help'; description = 'Помощь' }
  ) } | Out-Null

[pscustomobject]@{ Bot = "@$($bot.username)"; Webhook = "$WorkerUrl/telegram/webhook"; MiniApp = $MiniAppUrl } | Format-List
