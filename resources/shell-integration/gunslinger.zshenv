# Integração do Gunslinger com o zsh (macOS e Linux).
# O app aponta ZDOTDIR para a pasta destes arquivos; cada um carrega o arquivo equivalente do usuário
# (em GUNSLINGER_USER_ZDOTDIR) e o .zshrc instala os ganchos e devolve o ZDOTDIR original.

if [[ -f "$GUNSLINGER_USER_ZDOTDIR/.zshenv" && "$GUNSLINGER_USER_ZDOTDIR" != "$ZDOTDIR" ]]; then
  __gs_zdotdir=$ZDOTDIR
  ZDOTDIR=$GUNSLINGER_USER_ZDOTDIR
  . "$GUNSLINGER_USER_ZDOTDIR/.zshenv"
  # O .zshenv do usuário pode ter definido outro ZDOTDIR: é dele que vêm os próximos arquivos.
  GUNSLINGER_USER_ZDOTDIR=$ZDOTDIR
  ZDOTDIR=$__gs_zdotdir
  unset __gs_zdotdir
fi
