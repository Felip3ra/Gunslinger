# Integração do Gunslinger com o zsh: carrega o .zprofile do usuário (ver gunslinger.zshenv).

if [[ -f "$GUNSLINGER_USER_ZDOTDIR/.zprofile" && "$GUNSLINGER_USER_ZDOTDIR" != "$ZDOTDIR" ]]; then
  __gs_zdotdir=$ZDOTDIR
  ZDOTDIR=$GUNSLINGER_USER_ZDOTDIR
  . "$GUNSLINGER_USER_ZDOTDIR/.zprofile"
  ZDOTDIR=$__gs_zdotdir
  unset __gs_zdotdir
fi
