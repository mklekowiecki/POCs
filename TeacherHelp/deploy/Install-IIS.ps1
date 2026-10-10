<#
.SYNOPSIS
    Instaluje (lub aktualizuje) aplikację „Lekcja Informatyki” (Teacher Help) na lokalnym IIS.

.DESCRIPTION
    Skrypt:
      1. włącza potrzebne funkcje IIS (w tym WebSockets dla SignalR),
      2. instaluje ASP.NET Core Hosting Bundle (.NET 10), jeśli go brakuje,
      3. publikuje aplikację z kodu źródłowego (wymaga .NET SDK) albo bierze gotowy folder -PublishPath,
      4. tworzy pulę aplikacji i witrynę IIS oraz kopiuje pliki,
      5. zapisuje hasło nauczyciela w appsettings.Production.json,
      6. otwiera port w zaporze Windows dla sieci lokalnej.

    Uruchomienie ponownie aktualizuje aplikację: pliki są podmieniane, hasło zostaje (chyba że podasz nowe).

    UWAGA: stan lekcji jest trzymany w pamięci procesu. Pula aplikacji jest skonfigurowana tak,
    żeby nie wygaszała się po bezczynności i nie restartowała okresowo – ale restart IIS, zmiana
    plików aplikacji albo restart komputera kasuje bieżącą sesję.

.EXAMPLE
    .\Install-IIS.ps1
    Instalacja na porcie 80 z kodu w repozytorium; o hasło nauczyciela zapyta.

.EXAMPLE
    .\Install-IIS.ps1 -Port 5000 -TeacherPassword "tajne"

.EXAMPLE
    .\Install-IIS.ps1 -PublishPath D:\paczka
    Instalacja z gotowego wyniku „dotnet publish” (na komputerze bez .NET SDK).

.EXAMPLE
    .\Install-IIS.ps1 -Uninstall -RemoveFiles
#>
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$SiteName = "LekcjaInformatyki",
    [ValidateRange(1, 65535)]
    [int]$Port = 80,
    [string]$InstallPath = "$env:SystemDrive\inetpub\LekcjaInformatyki",
    [string]$TeacherPassword,
    [string]$PublishPath,
    [switch]$SkipPrerequisites,
    [switch]$Uninstall,
    [switch]$RemoveFiles
)

$ErrorActionPreference = "Stop"
$HostingBundleUrl = "https://aka.ms/dotnet/10.0/dotnet-hosting-win.exe"
$FirewallRuleName = "$SiteName-HTTP"
$ProjectPath = Join-Path $PSScriptRoot "..\TeacherHelp\TeacherHelp.csproj"

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

function Install-IisFeatures {
    Write-Step "Sprawdzanie funkcji IIS"
    if (Get-Command Install-WindowsFeature -ErrorAction SilentlyContinue) {
        # Windows Server
        $result = Install-WindowsFeature -Name Web-Server, Web-WebSockets, Web-Mgmt-Console, Web-Scripting-Tools
        if ($result.RestartNeeded -eq "Yes") { Write-Warning "Windows wymaga restartu po instalacji IIS." }
    }
    else {
        # Windows 10/11
        $features = "IIS-WebServerRole", "IIS-WebServer", "IIS-CommonHttpFeatures", "IIS-StaticContent",
                    "IIS-DefaultDocument", "IIS-HttpErrors", "IIS-RequestFiltering", "IIS-WebSockets",
                    "IIS-ManagementConsole", "IIS-ManagementScriptingTools"
        $missing = $features | Where-Object { (Get-WindowsOptionalFeature -Online -FeatureName $_).State -ne "Enabled" }
        if ($missing) {
            Write-Host "    Włączanie: $($missing -join ', ')"
            $result = Enable-WindowsOptionalFeature -Online -FeatureName $missing -All -NoRestart
            if ($result.RestartNeeded) { Write-Warning "Windows wymaga restartu po włączeniu IIS." }
        }
    }
}

function Test-HostingBundle {
    $module = Join-Path $env:ProgramFiles "IIS\Asp.Net Core Module\V2\aspnetcorev2.dll"
    $runtime = Join-Path $env:ProgramFiles "dotnet\shared\Microsoft.AspNetCore.App"
    return (Test-Path $module) -and (Test-Path $runtime) -and
           [bool](Get-ChildItem $runtime -Directory -Filter "10.*" -ErrorAction SilentlyContinue)
}

function Install-HostingBundle {
    Write-Step "Sprawdzanie ASP.NET Core Hosting Bundle (.NET 10)"
    if (Test-HostingBundle) { Write-Host "    Zainstalowany."; return }

    $installer = Join-Path $env:TEMP "dotnet-hosting-10-win.exe"
    Write-Host "    Pobieranie $HostingBundleUrl"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri $HostingBundleUrl -OutFile $installer -UseBasicParsing
    Write-Host "    Instalowanie (może potrwać kilka minut)"
    $process = Start-Process -FilePath $installer -ArgumentList "/install", "/quiet", "/norestart" -Wait -PassThru
    # 3010 = sukces, wymagany restart
    if ($process.ExitCode -notin 0, 3010) { throw "Instalator Hosting Bundle zakończył się kodem $($process.ExitCode)." }
    Remove-Item $installer -ErrorAction SilentlyContinue
    if (-not (Test-HostingBundle)) { throw "Hosting Bundle nadal nie jest widoczny. Zainstaluj go ręcznie: $HostingBundleUrl" }

    # IIS musi przeładować konfigurację, żeby zobaczyć moduł ASP.NET Core.
    Write-Host "    Restart IIS"
    & net stop was /y | Out-Null
    & net start w3svc | Out-Null
}

function Get-PublishedApp {
    if ($PublishPath) {
        if (-not (Test-Path (Join-Path $PublishPath "TeacherHelp.dll"))) {
            throw "W folderze '$PublishPath' nie ma TeacherHelp.dll - podaj wynik 'dotnet publish'."
        }
        return (Resolve-Path $PublishPath).Path
    }

    Write-Step "Publikowanie aplikacji z kodu źródłowego"
    if (-not (Test-Path $ProjectPath)) { throw "Nie znaleziono projektu: $ProjectPath. Użyj -PublishPath." }
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
        throw "Brak polecenia 'dotnet'. Zainstaluj .NET 10 SDK albo opublikuj aplikację na innym komputerze i użyj -PublishPath."
    }
    $output = Join-Path $env:TEMP "LekcjaInformatyki-publish"
    if (Test-Path $output) { Remove-Item $output -Recurse -Force }
    & dotnet publish $ProjectPath -c Release -o $output --nologo
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish zakończył się błędem ($LASTEXITCODE)." }
    return $output
}

function Stop-AppPoolAndWait([string]$Name) {
    if ((Get-WebAppPoolState -Name $Name).Value -ne "Stopped") {
        Stop-WebAppPool -Name $Name
        for ($i = 0; $i -lt 30 -and (Get-WebAppPoolState -Name $Name).Value -ne "Stopped"; $i++) { Start-Sleep -Seconds 1 }
    }
}

function Assert-PortFree {
    $conflicts = Get-Website | Where-Object { $_.Name -ne $SiteName } | Where-Object {
        $_.Bindings.Collection | Where-Object { $_.protocol -eq "http" -and $_.bindingInformation -match "^[^:]*:${Port}:" }
    }
    if ($conflicts) {
        $names = ($conflicts | ForEach-Object { $_.Name }) -join ", "
        throw "Port $Port jest już zajęty przez witrynę: $names. Zatrzymaj ją (Stop-Website '$names') albo użyj np. -Port 5000."
    }
}

function Get-LanAddresses {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        ForEach-Object { $_.IPAddress }
}

# ---------------------------------------------------------------------------

if (-not $Uninstall -and -not $SkipPrerequisites) {
    Install-IisFeatures
    Install-HostingBundle
}

Import-Module WebAdministration

if ($Uninstall) {
    Write-Step "Odinstalowywanie '$SiteName'"
    if (Test-Path "IIS:\Sites\$SiteName") { Remove-Website -Name $SiteName }
    if (Test-Path "IIS:\AppPools\$SiteName") { Stop-AppPoolAndWait $SiteName; Remove-WebAppPool -Name $SiteName }
    Remove-NetFirewallRule -Name $FirewallRuleName -ErrorAction SilentlyContinue
    if ($RemoveFiles -and (Test-Path $InstallPath)) { Remove-Item $InstallPath -Recurse -Force }
    Write-Host "Gotowe." -ForegroundColor Green
    return
}

Assert-PortFree
$source = Get-PublishedApp

$settingsFile = Join-Path $InstallPath "appsettings.Production.json"
if (-not $TeacherPassword -and -not (Test-Path $settingsFile)) {
    $secure = Read-Host "Podaj hasło nauczyciela" -AsSecureString
    $TeacherPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    if (-not $TeacherPassword) { throw "Hasło nauczyciela nie może być puste." }
}

Write-Step "Pula aplikacji '$SiteName'"
$poolPath = "IIS:\AppPools\$SiteName"
if (Test-Path $poolPath) { Stop-AppPoolAndWait $SiteName } else { New-WebAppPool -Name $SiteName | Out-Null }
Set-ItemProperty $poolPath -Name managedRuntimeVersion -Value ""            # ASP.NET Core = "No Managed Code"
Set-ItemProperty $poolPath -Name startMode -Value "AlwaysRunning"
Set-ItemProperty $poolPath -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)   # bez wygaszania po 20 min
Set-ItemProperty $poolPath -Name processModel.maxProcesses -Value 1         # stan w pamięci = jeden proces
Set-ItemProperty $poolPath -Name processModel.loadUserProfile -Value $true  # własny katalog TEMP na pliki
Set-ItemProperty $poolPath -Name recycling.periodicRestart.time -Value ([TimeSpan]::Zero)  # bez restartu co 29 h
Set-ItemProperty $poolPath -Name recycling.disallowOverlappingRotation -Value $true

Write-Step "Kopiowanie plików do $InstallPath"
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
# /MIR usuwa stare pliki, ale zostawia hasło (appsettings.Production.json) i logi.
& robocopy $source $InstallPath /MIR /XF appsettings.Production.json /XD logs /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy zakończył się błędem ($LASTEXITCODE)." }

if ($TeacherPassword) {
    @{ TeacherHelp = @{ TeacherPassword = $TeacherPassword } } | ConvertTo-Json | Set-Content -Path $settingsFile -Encoding UTF8
    Write-Host "    Zapisano hasło nauczyciela."
}
& icacls $InstallPath /grant "IIS AppPool\${SiteName}:(OI)(CI)RX" /T /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Nie udało się nadać uprawnień puli aplikacji do $InstallPath." }

Write-Step "Witryna '$SiteName' na porcie $Port"
if (Test-Path "IIS:\Sites\$SiteName") {
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $InstallPath
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $SiteName
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name bindings -Value @{ protocol = "http"; bindingInformation = "*:${Port}:" }
}
else {
    New-Website -Name $SiteName -Port $Port -PhysicalPath $InstallPath -ApplicationPool $SiteName | Out-Null
}

Write-Step "Zapora Windows: port $Port dla sieci lokalnej"
Remove-NetFirewallRule -Name $FirewallRuleName -ErrorAction SilentlyContinue
New-NetFirewallRule -Name $FirewallRuleName -DisplayName "Lekcja Informatyki (HTTP $Port)" `
    -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Action Allow | Out-Null

Write-Step "Uruchamianie"
Start-WebAppPool -Name $SiteName
Start-Website -Name $SiteName

$suffix = if ($Port -eq 80) { "" } else { ":$Port" }
try {
    $response = Invoke-WebRequest -Uri "http://localhost$suffix/" -UseBasicParsing -TimeoutSec 30
    Write-Host "    Strona odpowiada (HTTP $($response.StatusCode))."
}
catch {
    Write-Warning "Strona nie odpowiada: $($_.Exception.Message)"
    Write-Warning "Szczegóły: Podgląd zdarzeń > Dzienniki aplikacji (źródło 'IIS AspNetCore Module V2') albo włącz stdoutLogEnabled w $InstallPath\web.config."
}

Write-Host ""
Write-Host "Gotowe!" -ForegroundColor Green
Write-Host "  Panel nauczyciela: http://localhost$suffix/teacher.html"
foreach ($ip in Get-LanAddresses) { Write-Host "  Uczniowie:         http://$ip$suffix/" }
