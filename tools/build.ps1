param([string]$Destination = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& node (Join-Path $PSScriptRoot 'check.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Validation failed.' }
if (-not $Destination) { $Destination = Join-Path $projectRoot 'dist/QuietElement-1.1.0.zip' }
$zipPath = [System.IO.Path]::GetFullPath($Destination)
$zipDirectory = Split-Path -Parent $zipPath
New-Item -ItemType Directory -Path $zipDirectory -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
try {
  $sourceFiles = @('README.md','CHANGELOG.md','package.json','LICENSE','NOTICE.md','.gitignore') | ForEach-Object { Get-Item -LiteralPath (Join-Path $projectRoot $_) }
  foreach ($directory in @('extension','tests','tools','docs')) { $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse }
  foreach ($file in $sourceFiles) {
    $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$relative,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $zip.Dispose(); $stream.Dispose() }
Write-Output "Created $zipPath"
Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
