# Runs before Write/Edit tool calls.
# Outputs existing components + global CSS utilities so Claude
# checks for overlap before creating new code.

# Claude Code runs hooks with CWD = project root.
$cwd = (Get-Location).Path

function Abs($rel) { Join-Path $cwd $rel }

# Components
$components = Get-ChildItem -LiteralPath (Abs "src\components") -Filter "*.astro" -ErrorAction SilentlyContinue |
    ForEach-Object { $_.BaseName }

$layouts = Get-ChildItem -LiteralPath (Abs "src\layouts") -Filter "*.astro" -ErrorAction SilentlyContinue |
    ForEach-Object { $_.BaseName }

# Global CSS — extract class names and keyframe names
$cssClasses = @()
$keyframes  = @()
$globalCssPath = Abs "src\styles\global.css"
if (Test-Path -LiteralPath $globalCssPath) {
    $css = Get-Content -LiteralPath $globalCssPath -Raw
    $cssClasses = [regex]::Matches($css, '^\.([\w-]+)\s*[{,]', 'Multiline') |
        ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
    $keyframes  = [regex]::Matches($css, '@keyframes\s+([\w-]+)') |
        ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
}

# API functions (Go serverless)
$apiFiles = Get-ChildItem -LiteralPath (Abs "api") -Filter "*.go" -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName.Substring($cwd.Length + 1) }

Write-Output ""
Write-Output "=== PRE-WRITE CHECK ==================================="
if ($components.Count -gt 0) {
    Write-Output "  Components  : $($components -join ', ')"
}
if ($layouts.Count -gt 0) {
    Write-Output "  Layouts     : $($layouts -join ', ')"
}
if ($cssClasses.Count -gt 0) {
    Write-Output "  CSS classes : $($cssClasses -join ', ')"
}
if ($keyframes.Count -gt 0) {
    Write-Output "  @keyframes  : $($keyframes -join ', ')"
}
if ($apiFiles.Count -gt 0) {
    Write-Output "  API files   : $($apiFiles -join ', ')"
}
Write-Output "  >> Reuse or extend before creating new. No duplication."
Write-Output "======================================================="
Write-Output ""
