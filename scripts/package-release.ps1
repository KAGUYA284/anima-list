$ErrorActionPreference = 'Stop'

$workspace = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $workspace 'package.json') | ConvertFrom-Json
$version = $package.version
$releaseRoot = Join-Path $workspace '发布版本'
$versionRoot = Join-Path $releaseRoot "v$version"
$portableSource = Join-Path $workspace 'Anima List'
$installerSource = Join-Path $workspace ".desktop-build\Anima-List-Setup-$version.exe"
$apkSource = Join-Path $workspace 'android\app\build\outputs\apk\release\app-release.apk'
$stagingRoot = Join-Path $workspace '.release-staging'

function Assert-WorkspacePath {
    param([string]$Path)
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $fullPath.StartsWith("$workspace\", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "拒绝操作工作区外路径：$fullPath"
    }
}

foreach ($required in @($portableSource, $installerSource, $apkSource, (Join-Path $workspace 'dist\index.html'))) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "缺少发布源文件：$required"
    }
}
foreach ($path in @($releaseRoot, $versionRoot, $stagingRoot)) {
    Assert-WorkspacePath $path
}

if (Test-Path -LiteralPath $versionRoot) {
    Remove-Item -LiteralPath $versionRoot -Recurse -Force
}
if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}

$windowsInstaller = Join-Path $versionRoot 'Windows\安装版'
$windowsPortable = Join-Path $versionRoot 'Windows\免安装版'
$windowsCacheTest = Join-Path $versionRoot 'Windows\缓存测试版'
$androidTarget = Join-Path $versionRoot 'Android'
$webTarget = Join-Path $versionRoot 'Web'
New-Item -ItemType Directory -Force -Path $windowsInstaller, $windowsPortable, $windowsCacheTest, $androidTarget, $webTarget, $stagingRoot | Out-Null

Copy-Item -LiteralPath $installerSource -Destination (Join-Path $windowsInstaller "Anima-List-Setup-$version.exe")
Copy-Item -LiteralPath $apkSource -Destination (Join-Path $androidTarget "Anima-List-v$version-signed.apk")

$cleanTarget = Join-Path $windowsPortable "Anima List v$version"
New-Item -ItemType Directory -Force -Path $cleanTarget | Out-Null
Copy-Item -Path (Join-Path $portableSource '*') -Destination $cleanTarget -Recurse -Force

$cacheTarget = Join-Path $windowsCacheTest "Anima List v$version 缓存测试版"
New-Item -ItemType Directory -Force -Path $cacheTarget | Out-Null
Copy-Item -Path (Join-Path $portableSource '*') -Destination $cacheTarget -Recurse -Force
New-Item -ItemType File -Force -Path (Join-Path $cacheTarget '.anima-list-cache-test') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $cacheTarget 'test-user-data') | Out-Null
@'
此版本仅用于缓存和本地数据复现测试。

直接运行 “Anima List.exe” 即可。浏览器缓存、Local Storage、IndexedDB 等数据会保留在
同目录的 test-user-data 文件夹中；删除该文件夹即可重置测试数据。首次运行会在该目录
建立新的测试缓存，后续运行会复用同一份缓存。
'@ | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $cacheTarget '缓存测试版说明.txt')

Copy-Item -LiteralPath (Join-Path $workspace 'dist') -Destination (Join-Path $webTarget 'web') -Recurse
Copy-Item -LiteralPath (Join-Path $workspace 'scripts\release\server.ps1') -Destination $webTarget
Copy-Item -LiteralPath (Join-Path $workspace 'scripts\release\启动网页版.cmd') -Destination $webTarget

@"
Anima List v$version 发布目录

Windows\安装版
  Windows NSIS 安装程序。

Windows\免安装版
  不携带应用运行缓存的正式免安装目录，直接运行其中的 Anima List.exe。

Windows\缓存测试版
  将缓存和本地数据保存在同目录 test-user-data 中的测试目录，直接运行其中的 Anima List.exe。

Android
  已签名 Release APK。

Web
  双击“启动网页版.cmd”即可启动，不需要安装 Node.js；关闭命令窗口即停止服务。
"@ | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $versionRoot '版本说明.txt')

Remove-Item -LiteralPath $stagingRoot -Recurse -Force
Write-Host "发布产物已整理到：$versionRoot"
