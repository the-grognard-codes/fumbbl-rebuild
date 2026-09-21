param([Parameter(Mandatory=$true)][string]$DevJar, [Parameter(Mandatory=$true)][string]$ProdJar)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function ClassHashes([string]$path) {
    $archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $path).Path)
    $hash = [Security.Cryptography.SHA256]::Create()
    $result = @{}
    try {
        foreach ($entry in $archive.Entries) {
            if (!$entry.FullName.EndsWith('.class')) { continue }
            $stream = $entry.Open()
            try { $result[$entry.FullName] = [BitConverter]::ToString($hash.ComputeHash($stream)) }
            finally { $stream.Dispose() }
        }
    } finally { $archive.Dispose(); $hash.Dispose() }
    return $result
}
$reference = ClassHashes $DevJar
$candidate = ClassHashes $ProdJar
$allowed = @('BrowserV2TransportPolicy', 'BrowserV2Runtime', 'BrowserV2Runtime$1', 'NativeMarker6ServerMain', 'LocalServerMain') |
    ForEach-Object { "com/fumbbl/ffb/server/local/$_.class" }
if ($reference.Count -ne $candidate.Count) { throw 'Class inventory changed.' }
$changed = @()
foreach ($name in $reference.Keys) {
    if (!$candidate.ContainsKey($name)) { throw 'Missing reference class.' }
    if ($reference[$name] -ne $candidate[$name]) {
        if ($name -notin $allowed) { throw "Unexpected changed class: $name" }
        $changed += $name
    }
}
Write-Output "PASS: $($reference.Count) classes compared; $($changed.Count) permitted transport/launcher changes; all other classes byte-identical."
$changed | Sort-Object
