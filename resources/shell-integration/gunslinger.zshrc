# Integração do Gunslinger com o zsh (ver gunslinger.zshenv).
# Emite: OSC 133;C (início do comando), OSC 133;D;<código> (fim), OSC 9;9 (pasta atual), OSC 133;A/B
# e OSC 633;P;NodeVersion=<versão> quando o fnm troca a versão do Node na sessão.

# Daqui em diante o zsh volta a usar a pasta do usuário (.zlogin, .zlogout, histórico, compdump).
__gs_user_zdotdir=$GUNSLINGER_USER_ZDOTDIR
unset GUNSLINGER_USER_ZDOTDIR
if [[ -n "$__gs_user_zdotdir" && "$__gs_user_zdotdir" != "$HOME" ]]; then
  ZDOTDIR=$__gs_user_zdotdir
else
  unset ZDOTDIR
fi
[[ -f "${__gs_user_zdotdir:-$HOME}/.zshrc" ]] && . "${__gs_user_zdotdir:-$HOME}/.zshrc"
unset __gs_user_zdotdir

if [[ -z "$__GUNSLINGER_INTEGRATION" ]]; then
  __GUNSLINGER_INTEGRATION=1
  __gs_first=1
  __gs_node=

  # fnm: versão do Node desta sessão (FNM_MULTISHELL_PATH é um link para a pasta da versão).
  __gs_node_version() {
    [[ -n "$FNM_MULTISHELL_PATH" ]] || return 0
    local target
    target=$(readlink "$FNM_MULTISHELL_PATH" 2>/dev/null) || return 0
    if [[ "$target" =~ 'v[0-9]+\.[0-9]+\.[0-9]+' && "$MATCH" != "$__gs_node" ]]; then
      __gs_node=$MATCH
      printf '\033]633;P;NodeVersion=%s\033\\' "$__gs_node"
    fi
  }

  __gs_precmd() {
    local code=$?
    if [[ -z "$__gs_first" ]]; then
      printf '\033]133;D;%s\033\\' "$code"
    fi
    __gs_first=
    printf '\033]9;9;"%s"\033\\' "$PWD"
    __gs_node_version
    printf '\033]133;A\033\\'
    # Temas que remontam o prompt a cada comando perderiam a marca de fim do prompt.
    if [[ "$PS1" != *$'\033]133;B'* ]]; then
      PS1="${PS1}%{"$'\033]133;B\033\\'"%}"
    fi
    return $code
  }

  __gs_preexec() {
    printf '\033]133;C\033\\'
  }

  # Primeiro da lista, para ver o código de saída do comando antes dos ganchos do usuário.
  precmd_functions=(__gs_precmd $precmd_functions)
  preexec_functions+=(__gs_preexec)
fi
