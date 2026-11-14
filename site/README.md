# Site do Gunslinger

Página estática (HTML + CSS, sem build) para a Vercel: `index.html` (landing e download) e `manual.html`.

| Arquivo | O que é |
|---|---|
| `config.js` | link do instalador e da API de releases do GitHub (troque `Felip3ra/Gunslinger` se o repositório tiver outro nome) |
| `style.css`, `site.js` | estilo e comportamento comuns às duas páginas |
| `logo.svg` | logo; os PNGs e o `og-image.png` são gerados a partir dele |
| `img/` | prints reais do app (Windows) |
| `capture/` | script que gera logo em PNG, `og-image.png` e prints (não vai para o deploy) |

## Atualizar as imagens

```bash
npm run site:capture
```

Faz o build do app, abre o Gunslinger com um projeto de demonstração (.NET + Node + Git em `site/capture/.demo`, ignorado pelo Git) e grava as imagens. Para que nenhum caminho com o seu nome de usuário apareça nos prints, o script cria a junção temporária `C:\src\Loja` e a remove no fim (se `C:\src\Loja` já existir, ele para sem mexer em nada).

## Downloads por sistema

A seção de download consulta a última release do GitHub. O botão do Windows sempre aparece; os de Linux (`Gunslinger-linux-x86_64.AppImage`, `Gunslinger-linux-amd64.deb`) e macOS (`Gunslinger-mac-arm64.dmg`, `Gunslinger-mac-x64.dmg`) só aparecem quando a release tem o arquivo com esse nome, e aí os textos “para Windows 10 e 11” viram “Windows, Linux e macOS”. Os nomes vêm do `artifactName` em `electron-builder.yml`.

## 1. Publicar os instaladores (GitHub Releases)

A Vercel não aceita arquivos acima de 100 MB por deploy, então o instalador fica no GitHub. O `electron-builder.yml` gera o nome fixo `Gunslinger-Setup.exe`, e o link `releases/latest/download/Gunslinger-Setup.exe` sempre aponta para a última versão.

```bash
npm run dist
gh release create v0.1.0 dist/Gunslinger-Setup.exe --repo Felip3ra/Gunslinger --title "Gunslinger 0.1.0" --notes "Primeira versão"
```

O workflow `.github/workflows/release.yml` faz isso sozinho ao enviar uma tag `v*`: um job por sistema (Windows, Ubuntu e macOS) gera, testa e publica os instaladores na mesma release.

O repositório precisa ser **público** para o download funcionar sem login.

## 2. Publicar o site (Vercel)

Pelo painel: **Add New → Project**, importe o repositório e defina **Root Directory = `site`** e **Framework Preset = Other** (sem comando de build). Cada `git push` na branch principal publica o site.

Pela CLI:

```bash
cd site
npx vercel        # primeira vez: cria e liga o projeto
npx vercel --prod
```

Depois do primeiro deploy, troque `https://gunslinger.vercel.app` em `og:image` (`index.html` e `manual.html`) pelo domínio que a Vercel atribuir.
