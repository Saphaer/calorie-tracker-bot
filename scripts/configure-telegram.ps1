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
$ruCommands = '[{"command":"start","description":"\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c Nourish"},{"command":"open","description":"\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0434\u043d\u0435\u0432\u043d\u0438\u043a \u043f\u0438\u0442\u0430\u043d\u0438\u044f"},{"command":"help","description":"\u041f\u043e\u043c\u043e\u0449\u044c"}]' | ConvertFrom-Json
Invoke-Telegram 'setMyCommands' @{ language_code = 'ru'; commands = $ruCommands } | Out-Null

[pscustomobject]@{ Bot = "@$($bot.username)"; Webhook = "$WorkerUrl/telegram/webhook"; MiniApp = $MiniAppUrl } | Format-List
