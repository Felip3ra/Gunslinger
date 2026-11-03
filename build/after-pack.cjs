// Com signAndEditExecutable: false o electron-builder não grava ícone nem metadados no .exe
// (essa etapa baixa o winCodeSign, que exige privilégio de symlink). Fazemos só a parte do
// ícone aqui, com o rcedit do npm, antes de o NSIS empacotar.
const { join } = require('node:path');
const rcedit = require('rcedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const info = context.packager.appInfo;
  const exe = join(context.appOutDir, `${info.productFilename}.exe`);
  await rcedit(exe, {
    icon: join(__dirname, 'icon.ico'),
    'version-string': {
      ProductName: info.productName,
      FileDescription: info.productName,
      CompanyName: info.companyName ?? info.productName,
    },
    'file-version': info.version,
    'product-version': info.version,
  });
};
