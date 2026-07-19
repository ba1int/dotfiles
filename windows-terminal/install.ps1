[CmdletBinding()]
param(
    [switch]$NoDefault,
    [switch]$NoFont
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$profileGuid = "{b5bd7225-4a2b-442b-ac43-649a8f8b7660}"
$fragmentSource = Join-Path $PSScriptRoot "protocol-ink.json"
$fragmentDirectory = Join-Path $env:LOCALAPPDATA "Microsoft\Windows Terminal\Fragments\ProtocolInk"
$fragmentTarget = Join-Path $fragmentDirectory "protocol-ink.json"

function Install-CommitMono {
    $fontSourceDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) "fonts\commit-mono"
    $fontTargetDirectory = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
    $fontRegistryPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
    $fontFiles = @(
        @{
            File = "CommitMono-400-Regular.otf"
            RegistryName = "CommitMono Regular (OpenType)"
        },
        @{
            File = "CommitMono-700-Regular.otf"
            RegistryName = "CommitMono Bold (OpenType)"
        }
    )

    New-Item -ItemType Directory -Path $fontTargetDirectory -Force | Out-Null
    New-Item -Path $fontRegistryPath -Force | Out-Null

    foreach ($font in $fontFiles) {
        $source = Join-Path $fontSourceDirectory $font.File
        $target = Join-Path $fontTargetDirectory $font.File

        if (-not (Test-Path -LiteralPath $source)) {
            throw "Bundled font not found: $source"
        }

        $copyRequired = -not (Test-Path -LiteralPath $target)
        if (-not $copyRequired) {
            $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
            $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
            $copyRequired = $sourceHash -ne $targetHash
        }

        if ($copyRequired) {
            Copy-Item -LiteralPath $source -Destination $target -Force
            Write-Host ("install {0}" -f $target)
        }
        else {
            Write-Host ("ok      {0}" -f $target)
        }

        New-ItemProperty `
            -Path $fontRegistryPath `
            -Name $font.RegistryName `
            -Value $target `
            -PropertyType String `
            -Force | Out-Null
    }
}

if (-not (Test-Path -LiteralPath $fragmentSource)) {
    throw "Protocol Ink fragment not found: $fragmentSource"
}

# Fail before changing live settings if the repository fragment is invalid.
Get-Content -LiteralPath $fragmentSource -Raw | ConvertFrom-Json | Out-Null

if (-not $NoFont) {
    Install-CommitMono
}

New-Item -ItemType Directory -Path $fragmentDirectory -Force | Out-Null
Copy-Item -LiteralPath $fragmentSource -Destination $fragmentTarget -Force
Write-Host ("install {0}" -f $fragmentTarget)

if (-not $NoDefault) {
    $settingsCandidates = @(
        (Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"),
        (Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json"),
        (Join-Path $env:LOCALAPPDATA "Microsoft\Windows Terminal\settings.json")
    )
    $settingsPath = $settingsCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

    if ($null -eq $settingsPath) {
        Write-Warning "The profile was installed, but settings.json was not found. Launch Windows Terminal once, then rerun this installer to make Protocol Ink the default."
    }
    else {
        $settingsText = [System.IO.File]::ReadAllText($settingsPath)
        $defaultPattern = [regex]'(?m)(^\s*"defaultProfile"\s*:\s*)"\{[^"\r\n]+\}"'

        if ($defaultPattern.IsMatch($settingsText)) {
            $updatedText = $defaultPattern.Replace(
                $settingsText,
                { param($match) $match.Groups[1].Value + '"' + $profileGuid + '"' },
                1
            )
        }
        else {
            $objectMatch = [regex]::Match($settingsText, '(?m)^\s*\{')
            if (-not $objectMatch.Success) {
                throw "Windows Terminal settings do not contain a JSON object: $settingsPath"
            }

            $objectStart = $objectMatch.Index + $objectMatch.Value.LastIndexOf('{')
            $newline = if ($settingsText.Contains("`r`n")) { "`r`n" } else { "`n" }
            $defaultLine = $newline + '    "defaultProfile": "' + $profileGuid + '",'
            $updatedText = $settingsText.Insert($objectStart + 1, $defaultLine)
        }

        if ($updatedText -ne $settingsText) {
            $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $backupPath = "$settingsPath.protocol-ink-backup-$stamp"
            Copy-Item -LiteralPath $settingsPath -Destination $backupPath
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($settingsPath, $updatedText, $utf8NoBom)
            Write-Host ("backup  {0}" -f $backupPath)
            Write-Host ("default {0}" -f $profileGuid)
        }
        else {
            Write-Host ("ok      Protocol Ink is already the default profile")
        }
    }
}

Write-Host "Protocol Ink is installed. Restart Windows Terminal to load the fragment."
