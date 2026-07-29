param(
    [string]$Destination = (Join-Path $PSScriptRoot '..\public\assets\vendor')
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)

if (-not $resolvedDestination.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write assets outside repository: $resolvedDestination"
}

New-Item -ItemType Directory -Path $resolvedDestination -Force | Out-Null

$downloads = @(
    @{
        Name = 'punyworld-overworld.png'
        Url = 'https://opengameart.org/sites/default/files/punyworld-overworld-tileset_0.png'
    },
    @{
        Name = 'everrogue-tileset.png'
        Url = 'https://opengameart.org/sites/default/files/everroguetileset_full_packed.png'
    },
    @{
        Name = 'puny-characters.zip'
        Url = 'https://opengameart.org/sites/default/files/puny-characters.zip'
    },
    @{
        Name = 'kenney-rpg-audio.zip'
        Url = 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip'
    }
)

foreach ($download in $downloads) {
    $target = Join-Path $resolvedDestination $download.Name
    Invoke-WebRequest -Uri $download.Url -OutFile $target
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
    [PSCustomObject]@{
        File = $download.Name
        Sha256 = $hash
        Bytes = (Get-Item -LiteralPath $target).Length
    }
}

$charactersDir = Join-Path $resolvedDestination 'puny-characters'
$audioDir = Join-Path $resolvedDestination 'kenney-rpg-audio'
New-Item -ItemType Directory -Path $charactersDir -Force | Out-Null
New-Item -ItemType Directory -Path $audioDir -Force | Out-Null
Expand-Archive -LiteralPath (Join-Path $resolvedDestination 'puny-characters.zip') -DestinationPath $charactersDir -Force
Expand-Archive -LiteralPath (Join-Path $resolvedDestination 'kenney-rpg-audio.zip') -DestinationPath $audioDir -Force
