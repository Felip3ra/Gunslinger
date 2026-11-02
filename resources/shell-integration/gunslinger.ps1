# Integração do Gunslinger com o PowerShell (5.1 e 7+).
# Enviado via -EncodedCommand depois do perfil do usuário; não altera nenhum arquivo.
# Emite: OSC 133;D;<código> (fim do comando), OSC 9;9 (pasta atual), OSC 133;A/B (início/fim do prompt).

if ($global:__GunslingerIntegration) { return }
$global:__GunslingerIntegration = $true
$global:__GunslingerOriginalPrompt = $function:prompt
$global:__GunslingerFirstPrompt = $true

function global:prompt {
    # $? precisa ser lido antes de qualquer outro comando.
    $gsSuccess = $global:?
    $gsLastExit = $global:LASTEXITCODE
    $esc = [char]27
    $st = "$esc\"
    $out = ''

    if (-not $global:__GunslingerFirstPrompt) {
        $code = 0
        if (-not $gsSuccess) {
            if ($gsLastExit -is [int] -and $gsLastExit -ne 0) { $code = $gsLastExit } else { $code = 1 }
        }
        $out += "$esc]133;D;$code$st"
    }
    $global:__GunslingerFirstPrompt = $false

    $location = $executionContext.SessionState.Path.CurrentLocation
    if ($location.Provider.Name -eq 'FileSystem') {
        $out += "$esc]9;9;`"$($location.ProviderPath)`"$st"
    }
    $out += "$esc]133;A$st"

    # Restaura o código para que o prompt original (oh-my-posh, starship...) veja o valor correto.
    $global:LASTEXITCODE = $gsLastExit
    if ($global:__GunslingerOriginalPrompt) {
        $original = & $global:__GunslingerOriginalPrompt
    } else {
        $original = "PS $location$('>' * ($nestedPromptLevel + 1)) "
    }
    return $out + ($original -join '') + "$esc]133;B$st"
}
