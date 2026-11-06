# RevOps Cloudflare Tunnel Watchdog
$ErrorActionPreference = "Continue"
$cloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$configPath = "C:\Users\strel\.cloudflared\config.yml"

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$timestamp] Starting cloudflared tunnel..."
    try {
        & $cloudflaredPath tunnel --config $configPath run
    } catch {
        Write-Output "[$timestamp] Exception: $_"
    }
    $exitTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Output "[$exitTimestamp] cloudflared exited. Reconnecting in 3 seconds..."
    Start-Sleep -Seconds 3
}
