#!/usr/bin/env pwsh
# Deploy script for Railway

# Change to backend directory
Set-Location $PSScriptRoot

Write-Host "Current directory: $(Get-Location)"

Write-Host "Adding changes..."
git add src/database/initSchema.ts

Write-Host "Committing..."
git commit -m "Add waf_blocks table to fix cleanup job error"

Write-Host "Pushing to GitHub..."
git push origin main

Write-Host "Done! Railway will auto-deploy."
