# Rafraîchit la requête Power Query d'un classeur Excel (équivalent du bouton
# Données > Actualiser tout) puis l'enregistre, via automatisation COM.
# Usage : powershell -File refresh-excel.ps1 -Path "C:\...\fichier.xlsx"
#
# Sortie : "OK" sur stdout et code de sortie 0 en cas de succès ;
#          "ERROR: <message>" et code de sortie 1 en cas d'échec.
#
# Le processus EXCEL.EXE créé par l'automatisation COM est un serveur
# out-of-process : si ce script est interrompu de force (timeout côté
# appelant), Excel peut rester ouvert et verrouiller le fichier pour les
# prochaines tentatives. On identifie donc précisément le PID du processus
# qu'on vient de créer, pour pouvoir le forcer à se terminer nous-mêmes.

param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
    Write-Output "ERROR: fichier introuvable : $Path"
    exit 1
}

# Nettoyage préventif : si une précédente tentative a été interrompue de force
# (timeout côté appelant), elle peut avoir laissé un EXCEL.EXE orphelin qui
# verrouille encore le fichier. On ne ferme que les instances SANS fenêtre
# visible (donc jamais une session Excel ouverte manuellement par un
# utilisateur), avant de démarrer notre propre instance.
Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' } | Stop-Process -Force -ErrorAction SilentlyContinue
if (Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' }) { Start-Sleep -Milliseconds 800 }

$before = @(Get-Process EXCEL -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

$excel = $null
$wb = $null
$excelPid = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false

    $after = @(Get-Process EXCEL -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    $newPids = $after | Where-Object { $before -notcontains $_ }
    if ($newPids) { $excelPid = $newPids[0] }

    $wb = $excel.Workbooks.Open($Path)
    $wb.RefreshAll()

    # Attente bornée de la fin des requêtes Power Query (au lieu de faire
    # confiance à un unique appel bloquant sans limite de temps).
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        try {
            if (-not $excel.CalculateUntilAsyncQueriesDone()) { break }
        } catch { break }
        Start-Sleep -Milliseconds 500
    }

    $wb.Save()
    $wb.Close($true)
    Write-Output "OK"
    exit 0
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
} finally {
    if ($wb) { try { $wb.Close($false) } catch {} }
    if ($excel) {
        try { $excel.Quit() } catch {}
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    if ($excelPid) {
        Start-Sleep -Milliseconds 500
        Stop-Process -Id $excelPid -Force -ErrorAction SilentlyContinue
    }
}
