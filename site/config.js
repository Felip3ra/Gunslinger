// Configuração do site de download do Gunslinger.
// O instalador fica no GitHub Releases (a Vercel não serve arquivos acima de 100 MB por deploy).
// Troque OWNER/REPO se o repositório tiver outro nome.
window.GUNSLINGER_CONFIG = {
  version: '1.1.0',
  sizeLabel: '87 MB',
  installerUrl: 'https://github.com/Felip3ra/Gunslinger/releases/latest/download/Gunslinger-Setup.exe',
  // Linux e macOS: os botões (data-asset no index.html) só aparecem quando a última release tem o arquivo.
  // Consultado no navegador para mostrar sempre a versão e o tamanho da última release.
  releasesApi: 'https://api.github.com/repos/Felip3ra/Gunslinger/releases/latest',
  releasesPage: 'https://github.com/Felip3ra/Gunslinger/releases',
};
