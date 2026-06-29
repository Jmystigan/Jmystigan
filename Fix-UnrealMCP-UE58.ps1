# Fix-UnrealMCP-UE58.ps1
# Restores original UnrealMCP plugin files and patches them for UE5.8 compatibility
# ANY_PACKAGE was removed in UE5.1 - this replaces all usages with FindFirstObject

$PluginPath = "C:\Users\thepa\Documents\Unreal Projects\piranauts 5.3 5.6 5.8\Plugins\UnrealMCP\Source\UnrealMCP\Private\Commands"

$BaseUrl = "https://raw.githubusercontent.com/chongdashu/unreal-mcp/main/MCPGameProject/Plugins/UnrealMCP/Source/UnrealMCP/Private/Commands"

function Download-And-Fix {
    param(
        [string]$FileName,
        [hashtable]$Replacements
    )

    $FilePath = Join-Path $PluginPath $FileName
    $Url = "$BaseUrl/$FileName"

    Write-Host "`nDownloading original $FileName ..." -ForegroundColor Cyan
    try {
        $content = Invoke-WebRequest -Uri $Url -UseBasicParsing | Select-Object -ExpandProperty Content
    } catch {
        Write-Host "ERROR: Failed to download $FileName - $_" -ForegroundColor Red
        return
    }

    Write-Host "Applying UE5.8 fixes..." -ForegroundColor Yellow
    foreach ($old in $Replacements.Keys) {
        $new = $Replacements[$old]
        if ($content.Contains($old)) {
            $content = $content.Replace($old, $new)
            Write-Host "  Replaced: $old" -ForegroundColor Green
        } else {
            Write-Host "  WARNING: Pattern not found (already fixed?): $old" -ForegroundColor Yellow
        }
    }

    Write-Host "Saving to $FilePath ..." -ForegroundColor Cyan
    [System.IO.File]::WriteAllText($FilePath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Done: $FileName" -ForegroundColor Green
}

# --- Fix UnrealMCPBlueprintCommands.cpp (4 replacements) ---
Download-And-Fix -FileName "UnrealMCPBlueprintCommands.cpp" -Replacements @{
    'FindObject<UClass>(ANY_PACKAGE, *ComponentType)'          = 'FindFirstObject<UClass>(*ComponentType)';
    'FindObject<UClass>(ANY_PACKAGE, *ComponentTypeWithSuffix)' = 'FindFirstObject<UClass>(*ComponentTypeWithSuffix)';
    'FindObject<UClass>(ANY_PACKAGE, *ComponentTypeWithPrefix)' = 'FindFirstObject<UClass>(*ComponentTypeWithPrefix)';
    'FindObject<UClass>(ANY_PACKAGE, *ComponentTypeWithBoth)'  = 'FindFirstObject<UClass>(*ComponentTypeWithBoth)';
}

# --- Fix UnrealMCPBlueprintNodeCommands.cpp (5 replacements) ---
Download-And-Fix -FileName "UnrealMCPBlueprintNodeCommands.cpp" -Replacements @{
    'FindObject<UClass>(ANY_PACKAGE, *Target)'                           = 'FindFirstObject<UClass>(*Target)';
    'FindObject<UClass>(ANY_PACKAGE, *TargetWithPrefix)'                 = 'FindFirstObject<UClass>(*TargetWithPrefix)';
    'FindObject<UClass>(ANY_PACKAGE, *ClassName)'                        = 'FindFirstObject<UClass>(*ClassName)';
    'FindObject<UClass>(ANY_PACKAGE, TEXT("UGameplayStatics"))'          = 'FindFirstObject<UClass>(TEXT("UGameplayStatics"))';
}

Write-Host "`n====================================" -ForegroundColor Cyan
Write-Host "All fixes applied!" -ForegroundColor Green
Write-Host "Now go to Visual Studio and rebuild: right-click piranauts -> Build" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
