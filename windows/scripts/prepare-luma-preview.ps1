param(
  [Parameter(Mandatory=$true)][string]$RuntimeDirectory,
  [string]$Destination = ''
)
$ErrorActionPreference='Stop'
if(-not $Destination){$Destination=Join-Path $PSScriptRoot '../dist/Mascotte-Luma'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$runtime=[IO.Path]::GetFullPath($RuntimeDirectory)
$dest=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $dest){throw "Destination already exists: $dest"}
if(-not(Test-Path -LiteralPath (Join-Path $runtime 'Mascotte.exe'))){throw 'Mascotte runtime missing'}
$toml=Join-Path $root 'windows/node_modules/smol-toml'
if(-not(Test-Path -LiteralPath $toml)){throw 'smol-toml dependency missing'}
New-Item -ItemType Directory -Force $dest | Out-Null
# Copy only runtime assets, never old app data, diagnostics or profile directories.
$files=@('Mascotte.exe','chrome_100_percent.pak','chrome_200_percent.pak','d3dcompiler_47.dll','dxcompiler.dll','dxil.dll','ffmpeg.dll','icudtl.dat','LICENSE.electron.txt','LICENSES.chromium.html','resources.pak','snapshot_blob.bin','v8_context_snapshot.bin','vk_swiftshader.dll','vk_swiftshader_icd.json','vulkan-1.dll')
foreach($name in $files){Copy-Item -LiteralPath (Join-Path $runtime $name) -Destination $dest}
Copy-Item -LiteralPath (Join-Path $runtime 'locales') -Destination $dest -Recurse
$app=Join-Path $dest 'resources/app'
New-Item -ItemType Directory -Force $app,(Join-Path $app 'resources'),(Join-Path $app 'node_modules'),(Join-Path $dest 'dati-luma') | Out-Null
foreach($name in @('main.cjs','preload.cjs','package.json','lib','renderer')){
  Copy-Item -LiteralPath (Join-Path $root "windows/$name") -Destination $app -Recurse
}
Copy-Item -LiteralPath $toml -Destination (Join-Path $app 'node_modules') -Recurse
foreach($name in @('characters','spec')){Copy-Item -LiteralPath (Join-Path $root $name) -Destination (Join-Path $app 'resources') -Recurse}
Copy-Item -LiteralPath (Join-Path $root 'viewer/pack.js') -Destination (Join-Path $app 'resources/pack.js')
Copy-Item -LiteralPath (Join-Path $root 'windows/scripts/install-update.cjs') -Destination (Join-Path $dest 'resources/mascotte-updater.cjs')
[IO.File]::WriteAllText((Join-Path $dest 'dati-luma/settings.json'),' {"character":"luma","scale":3,"scales":{"luma":3},"attachment":"free"}',[Text.UTF8Encoding]::new($false))
$launcher=@'
@echo off
setlocal
set "MASCOTTE_WINDOWS_DATA_DIR=%~dp0dati-luma"
set "MASCOTTE_PREVIEW=1"
start "" "%~dp0Mascotte.exe"
'@
[IO.File]::WriteAllText((Join-Path $dest 'Avvia Luma.cmd'),$launcher.Replace("`n","`r`n"),[Text.ASCIIEncoding]::new())
$guide=@'
LUMA - PRIMA VERSIONE UTILIZZABILE

Apri "Avvia Luma.cmd": Luma compare sul desktop a grandezza 3x (circa 192 punti di altezza).
Trascina per spostarla; clic destro per Grandezza, Personaggio ed Esci.
Per tornare a Rosso: Personaggio > Cat > Rosso.

Questa copia usa dati-luma/ e una porta eventi libera. Non modifica i dati
della Mascotte gia installata. Conserva tutta la cartella insieme.
Apri sempre il comando Avvia Luma.cmd per mantenere questi dati separati.

Luma ha per ora solo idle: respiro e battito degli occhi. Gli altri stati
usano idle. Non ci sono chiamate IA automatiche per le animazioni.
'@
[IO.File]::WriteAllText((Join-Path $dest 'LEGGIMI-LUMA.txt'),$guide,[Text.UTF8Encoding]::new($false))
Write-Output "Ready: $dest"
