// O pacote publicado do node-pty 1.1.0 traz o spawn-helper do macOS sem permissão de execução, e sem
// ela nenhum shell abre ("posix_spawnp failed"). Roda no postinstall, antes do build e do empacotamento,
// que copia o arquivo com a permissão para dentro do app.
const { chmodSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const prebuilds = join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');
if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper');
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
