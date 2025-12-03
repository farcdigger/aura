# Quick API Test Script for PowerShell
# Bu script API server'a test isteği gönderir

Write-Host "🧪 Quick API Test" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host ""

# Test pool ID (SOL/USDC on Raydium)
$poolId = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
$apiUrl = "http://localhost:3000"

# 1. Health Check
Write-Host "📊 Step 1: Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$apiUrl/health" -Method GET
    Write-Host "✅ Server is healthy!" -ForegroundColor Green
    Write-Host "   Redis: $($health.redis)" -ForegroundColor Gray
    Write-Host "   Supabase: $($health.supabase)" -ForegroundColor Gray
    Write-Host "   Helius: $($health.helius)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "💡 Make sure API server is running: bun run dev" -ForegroundColor Yellow
    exit 1
}

# 2. Submit Analysis Job
Write-Host "📊 Step 2: Submit Analysis Job" -ForegroundColor Yellow
Write-Host "   Pool ID: $poolId" -ForegroundColor Gray

$body = @{
    poolId = $poolId
    userId = "test-user-ps1"
    options = @{
        transactionLimit = 100
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/analyze" -Method POST -Body $body -ContentType "application/json"
    
    if ($response.status -eq "cached") {
        Write-Host "⚡ Result was cached!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Analysis Result:" -ForegroundColor Cyan
        Write-Host ($response.result | ConvertTo-Json -Depth 10)
        exit 0
    }
    
    $jobId = $response.jobId
    Write-Host "✅ Job created: $jobId" -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host "❌ Job creation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Poll Job Status
Write-Host "📊 Step 3: Wait for Analysis (max 2 minutes)" -ForegroundColor Yellow
Write-Host "⚠️  Make sure Worker is running in another terminal!" -ForegroundColor Yellow
Write-Host ""

$maxWaitSeconds = 120
$pollIntervalSeconds = 3
$elapsed = 0

while ($elapsed -lt $maxWaitSeconds) {
    try {
        $status = Invoke-RestMethod -Uri "$apiUrl/status/$jobId" -Method GET
        
        Write-Host "   [$elapsed`s] State: $($status.state) | Progress: $($status.progress)%" -ForegroundColor Gray
        
        if ($status.state -eq "completed") {
            Write-Host ""
            Write-Host "✅ Analysis Completed!" -ForegroundColor Green
            Write-Host ""
            Write-Host "📊 Result:" -ForegroundColor Cyan
            Write-Host "   Pool ID: $($status.result.poolId)" -ForegroundColor White
            Write-Host "   Risk Score: $($status.result.riskScore)/100" -ForegroundColor White
            Write-Host ""
            Write-Host "Full Result:" -ForegroundColor Cyan
            Write-Host ($status.result | ConvertTo-Json -Depth 10)
            exit 0
        }
        
        if ($status.state -eq "failed") {
            Write-Host ""
            Write-Host "❌ Analysis Failed!" -ForegroundColor Red
            Write-Host "   Error: $($status.error)" -ForegroundColor Red
            exit 1
        }
        
        Start-Sleep -Seconds $pollIntervalSeconds
        $elapsed += $pollIntervalSeconds
        
    } catch {
        Write-Host "❌ Status check failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "❌ Timeout! Job did not complete in $maxWaitSeconds seconds" -ForegroundColor Red
Write-Host "💡 Check if Worker is running: bun run worker" -ForegroundColor Yellow
exit 1

