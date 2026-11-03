# Integração do Gunslinger com o Bash (Git Bash e WSL).
# Usado via `bash --rcfile gunslinger.bash -i`. Como --rcfile não funciona com --login,
# este arquivo emula o login: /etc/profile e depois o primeiro perfil do usuário encontrado.
# Emite: OSC 133;C (início do comando), OSC 133;D;<código> (fim), OSC 9;9 (pasta atual), OSC 133;A/B
# e OSC 633;P;NodeVersion=<versão> quando o fnm troca a versão do Node na sessão.

if [ -z "$__GUNSLINGER_LOGIN_DONE" ]; then
  __GUNSLINGER_LOGIN_DONE=1
  [ -r /etc/profile ] && . /etc/profile
  if [ -r "$HOME/.bash_profile" ]; then
    . "$HOME/.bash_profile"
  elif [ -r "$HOME/.bash_login" ]; then
    . "$HOME/.bash_login"
  elif [ -r "$HOME/.profile" ]; then
    . "$HOME/.profile"
  elif [ -r "$HOME/.bashrc" ]; then
    . "$HOME/.bashrc"
  fi
fi

if [ -z "$__GUNSLINGER_INTEGRATION" ]; then
  __GUNSLINGER_INTEGRATION=1
  __gs_first=1
  __gs_last_pwd=
  __gs_last_winpath=

  __gs_winpath() {
    # Converte só quando a pasta muda: cygpath/wslpath são processos externos.
    if [ "$PWD" != "$__gs_last_pwd" ]; then
      __gs_last_pwd=$PWD
      if command -v cygpath >/dev/null 2>&1; then
        __gs_last_winpath=$(cygpath -w "$PWD")
      elif command -v wslpath >/dev/null 2>&1; then
        __gs_last_winpath=$(wslpath -w "$PWD" 2>/dev/null || printf '%s' "$PWD")
      else
        __gs_last_winpath=$PWD
      fi
    fi
    printf '%s' "$__gs_last_winpath"
  }

  # fnm: versão do Node desta sessão (FNM_MULTISHELL_PATH é um link para a pasta da versão).
  __gs_node=
  __gs_node_version() {
    [ -n "$FNM_MULTISHELL_PATH" ] || return 0
    local target
    target=$(readlink "$FNM_MULTISHELL_PATH" 2>/dev/null) || return 0
    [[ $target =~ v[0-9]+\.[0-9]+\.[0-9]+ ]] || return 0
    if [ "${BASH_REMATCH[0]}" != "$__gs_node" ]; then
      __gs_node=${BASH_REMATCH[0]}
      printf '\033]633;P;NodeVersion=%s\033\\' "$__gs_node"
    fi
  }

  __gs_prompt_command() {
    local code=$?
    if [ -z "$__gs_first" ]; then
      printf '\033]133;D;%s\033\\' "$code"
    fi
    __gs_first=
    printf '\033]9;9;"%s"\033\\' "$(__gs_winpath)"
    __gs_node_version
    printf '\033]133;A\033\\'
    # Devolve o código original para o PROMPT_COMMAND do usuário e o prompt do Git.
    return $code
  }

  PROMPT_COMMAND="__gs_prompt_command${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
  PS1="${PS1}\[\033]133;B\033\\\\\]"
  PS0="\033]133;C\033\\\\${PS0}"
fi
