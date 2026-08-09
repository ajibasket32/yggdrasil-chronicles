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
    },
    @{
        Name = 'monster-pack-2d.zip'
        Url = 'https://opengameart.org/sites/default/files/50_monsters_pack_2d_version_1.0_0.zip'
    },
    @{
        Name = 'everface.png'
        Url = 'https://opengameart.org/sites/default/files/everface1.0.png'
    },
    @{
        Name = 'music/TownTheme.mp3'
        Url = 'https://opengameart.org/sites/default/files/TownTheme.mp3'
    },
    @{
        Name = 'music/battleThemeA.mp3'
        Url = 'https://opengameart.org/sites/default/files/battleThemeA.mp3'
    },
    @{
        Name = 'music/song18_0.mp3'
        Url = 'https://opengameart.org/sites/default/files/song18_0.mp3'
    },
    @{
        Name = 'music/the_field_of_dreams.mp3'
        Url = 'https://opengameart.org/sites/default/files/the_field_of_dreams.mp3'
    },
    @{
        Name = 'music/The_Old_Tower_Inn.mp3'
        Url = 'https://opengameart.org/sites/default/files/The_Old_Tower_Inn.mp3'
    }
)

foreach ($download in $downloads) {
    $target = Join-Path $resolvedDestination $download.Name
    New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
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
$monsterDir = Join-Path $resolvedDestination 'monster-pack-2d'
New-Item -ItemType Directory -Path $charactersDir -Force | Out-Null
New-Item -ItemType Directory -Path $audioDir -Force | Out-Null
Expand-Archive -LiteralPath (Join-Path $resolvedDestination 'puny-characters.zip') -DestinationPath $charactersDir -Force
Expand-Archive -LiteralPath (Join-Path $resolvedDestination 'kenney-rpg-audio.zip') -DestinationPath $audioDir -Force

$monsterExtract = Join-Path ([System.IO.Path]::GetTempPath()) ("yggdrasil-monsters-" + [guid]::NewGuid())
try {
    Expand-Archive -LiteralPath (Join-Path $resolvedDestination 'monster-pack-2d.zip') -DestinationPath $monsterExtract
    $monsterSource = Join-Path $monsterExtract '50+ Monsters Pack 2D\Monsters\Normal Colors'
    New-Item -ItemType Directory -Path $monsterDir -Force | Out-Null
    $monsterFiles = @{
        7 = 'mote.png'; 9 = 'star-echo.png'; 15 = 'moth.png'; 23 = 'gnawer.png'
        31 = 'sentinel.png'; 32 = 'slime.png'; 33 = 'custodian.png'; 38 = 'kiln-core.png'
        39 = 'wraith.png'; 43 = 'horned-beast.png'; 48 = 'wolf.png'
    }
    foreach ($number in $monsterFiles.Keys) {
        Copy-Item -LiteralPath (Join-Path $monsterSource "Monster #$number Front Normal Color Palette.png") -Destination (Join-Path $monsterDir $monsterFiles[$number]) -Force
    }
    Copy-Item -LiteralPath (Join-Path $monsterExtract '50+ Monsters Pack 2D\Credits.txt') -Destination (Join-Path $monsterDir 'License.txt') -Force
}
finally {
    Remove-Item -LiteralPath $monsterExtract -Recurse -Force -ErrorAction SilentlyContinue
}
