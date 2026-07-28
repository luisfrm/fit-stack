$appManifest = Get-Content -Path "apps\console\.next\app-build-manifest.json" -Raw | ConvertFrom-Json
$pages = $appManifest.pages
Write-Host "=== App Pages count: $($pages.PSObject.Properties.Count) ==="
$results = @()
foreach ($p in $pages.PSObject.Properties) {
  $files = $p.Value
  $sum = 0
  foreach ($f in $files) {
    $path = "apps\console\.next\$f"
    if (Test-Path -LiteralPath $path) { $sum += (Get-Item $path).Length }
  }
  $line = "{0,-60} {1,10:N0} B  ({2} files)" -f $p.Name, $sum, $files.Count
  Write-Host $line
  $results += $line
}
$results | Out-File -FilePath "spec\baseline-bundles.txt" -Encoding utf8
