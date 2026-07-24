param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'

$webRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'web'))
$webRootPrefix = $webRoot.TrimEnd('\') + '\'
if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'index.html'))) {
    throw "网页文件不完整：$webRoot"
}

$listener = $null
$port = 4173
while ($port -le 4193) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $listener.Start()
        break
    } catch {
        if ($listener) {
            $listener.Stop()
            $listener = $null
        }
        $port++
    }
}
if (-not $listener) {
    throw '无法在 4173-4193 端口启动本地服务。'
}

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.webp' = 'image/webp'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$ContentType,
        [byte[]]$Body
    )
    $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
}

$url = "http://127.0.0.1:$port/"
Write-Host "[Anima List] 网页版已启动：$url"
Write-Host '关闭此窗口即可停止服务。'
if ($NoBrowser -or $env:ANIMA_LIST_NO_BROWSER -eq '1') {
    Write-Host '[Anima List] 无浏览器测试模式。'
} else {
    Start-Process $url
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
            $requestLine = $reader.ReadLine()
            while ($reader.ReadLine()) {}

            if ($requestLine -notmatch '^GET\s+(\S+)\s+HTTP/') {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
                Send-Response $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $body
                continue
            }

            $requestPath = [System.Uri]::UnescapeDataString(($Matches[1] -split '\?')[0]).Replace('/', '\')
            if ($requestPath -eq '\') {
                $requestPath = '\index.html'
            }
            $filePath = [System.IO.Path]::GetFullPath((Join-Path $webRoot $requestPath.TrimStart('\')))
            if (-not $filePath.StartsWith($webRootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' $body
                continue
            }

            $body = [System.IO.File]::ReadAllBytes($filePath)
            $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $contentType = $mimeTypes[$extension]
            if (-not $contentType) {
                $contentType = 'application/octet-stream'
            }
            Send-Response $stream 200 'OK' $contentType $body
        } finally {
            $client.Dispose()
        }
    }
} finally {
    $listener.Stop()
}
