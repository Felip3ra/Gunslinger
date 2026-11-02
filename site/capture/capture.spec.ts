import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from '../../tests/e2e/helpers';

const SITE = resolve('site');
const DEMO = resolve('site/capture/.demo');
const ROOT = join(DEMO, 'Loja');
// Caminho neutro nos prints (o real teria o nome do usuário): junção temporária, removida no fim.
const SRC = String.raw`C:\src`;
const LINK = join(SRC, 'Loja');
const VITEST = resolve('node_modules/vitest/vitest.mjs');
const WIDTH = 1440;
const HEIGHT = 900;

// ---------- projeto de demonstração (.NET + Node + Git) ----------

const DEMO_CMD = String.raw`@echo off
echo   Determining projects to restore...
echo   Loja.Api -^> C:\src\Loja\src\Loja.Api\bin\Debug\net8.0\Loja.Api.dll
echo.
echo Build succeeded.
echo     0 Warning(s)
echo     0 Error(s)
echo.
echo info: Microsoft.Hosting.Lifetime[14]
echo       Now listening on: http://localhost:5270
echo info: Microsoft.Hosting.Lifetime[0]
echo       Application started. Press Ctrl+C to shut down.
echo warn: Microsoft.EntityFrameworkCore.Model.Validation[10400]
echo       Sensitive data logging is enabled. Log entries may include application data.
echo info: Loja.Api.Pedidos.PedidoService[0]
echo       Pedido 4821 confirmado em 112 ms
echo fail: Loja.Api.Pedidos.PedidoService[0]
echo       Pedido 4822 falhou: TimeoutException ao chamar o gateway de pagamento
echo          at Loja.Api.Pagamentos.GatewayClient.CobrarAsync() in src\Loja.Api\Pagamentos\GatewayClient.cs:line 42
echo info: Loja.Api.Pedidos.PedidoService[0]
echo       Pedido 4823 confirmado em 98 ms
`;

const LAUNCH_SETTINGS = {
  profiles: {
    http: {
      commandName: 'Project',
      applicationUrl: 'http://localhost:5270',
      environmentVariables: { ASPNETCORE_ENVIRONMENT: 'Development' },
    },
    https: {
      commandName: 'Project',
      applicationUrl: 'https://localhost:7270;http://localhost:5270',
      environmentVariables: { ASPNETCORE_ENVIRONMENT: 'Development' },
    },
    'IIS Express': { commandName: 'IISExpress' },
  },
};

const PEDIDOS_TEST = `import { describe, expect, it } from 'vitest';

const total = (itens: { preco: number; qtd: number }[]) => itens.reduce((s, i) => s + i.preco * i.qtd, 0);

describe('pedidos', () => {
  it('soma os itens', () => {
    expect(total([{ preco: 10, qtd: 2 }, { preco: 5, qtd: 1 }])).toBe(25);
  });
  it('pedido vazio custa zero', () => {
    expect(total([])).toBe(0);
  });
  it('aplica o frete grátis acima de 200', () => {
    expect(total([{ preco: 120, qtd: 2 }])).toBe(230);
  });
});
`;

function file(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function createDemo(): string {
  rmSync(DEMO, { recursive: true, force: true });
  file(join(ROOT, 'iniciar-api.cmd'), DEMO_CMD.replace(/\n/g, '\r\n'));
  file(
    join(ROOT, 'package.json'),
    JSON.stringify(
      {
        name: 'loja-web',
        private: true,
        // Pela junção, o npm não acharia o vitest do repositório em node_modules/.bin.
        scripts: { dev: 'vite', build: 'vite build', test: `node "${VITEST}"`, lint: 'eslint .' },
        devDependencies: { vitest: '*' },
      },
      null,
      2,
    ),
  );
  // Stack só com o frame do teste: os frames do vitest teriam o caminho real do repositório.
  file(join(ROOT, 'vitest.config.mjs'), "export default { test: { include: ['**/*.test.ts'], setupFiles: ['./vitest.setup.mjs'] } };\n");
  file(join(ROOT, 'vitest.setup.mjs'), 'Error.stackTraceLimit = 1;\n');
  file(join(ROOT, 'web', 'pedidos.test.ts'), PEDIDOS_TEST);
  file(
    join(ROOT, 'src', 'Loja.Api', 'Loja.Api.csproj'),
    `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="8.0.0" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.0" />
  </ItemGroup>
</Project>
`,
  );
  file(join(ROOT, 'src', 'Loja.Api', 'Properties', 'launchSettings.json'), JSON.stringify(LAUNCH_SETTINGS, null, 2));
  file(join(ROOT, '.gitignore'), 'node_modules/\nbin/\nobj/\n');

  const git = (...args: string[]): void => {
    execFileSync('git', ['-c', 'user.name=Demo', '-c', 'user.email=demo@example.com', ...args], { cwd: ROOT, stdio: 'ignore' });
  };
  git('init', '-b', 'feature/pedidos');
  git('add', '.');
  git('commit', '-m', 'Pedidos com gateway de pagamento');
  file(join(ROOT, 'web', 'pedidos.ts'), 'export {};\n'); // alteração pendente: aparece como "1 alterado"

  const userData = join(DEMO, 'userdata');
  const cmd = (id: string, name: string, command: string, category: string, description = '') => ({
    id,
    name,
    command,
    description,
    category,
    targetProfileId: null,
    cwd: null,
    projectId: null,
    variables: {},
  });
  file(
    join(userData, 'settings.json'),
    JSON.stringify({
      version: 1,
      defaultProfile: 'builtin.cmd',
      environments: [
        { id: 'dev', name: 'Dev', color: '#3fb950', confirm: false, variables: { ASPNETCORE_ENVIRONMENT: 'Development' } },
        { id: 'hml', name: 'Homologação', color: '#d29922', confirm: false, variables: { ASPNETCORE_ENVIRONMENT: 'Staging' } },
        { id: 'prd', name: 'Produção', color: '#f85149', confirm: true, variables: { ASPNETCORE_ENVIRONMENT: 'Production' } },
      ],
    }),
  );
  file(
    join(userData, 'commands.json'),
    JSON.stringify({
      version: 1,
      commands: [
        cmd('g1', 'Trocar de branch', 'git checkout {branch}', 'Git', 'Pede o nome da branch'),
        cmd('g2', 'Atualizar main', 'git pull --rebase origin main', 'Git'),
        cmd('d1', 'Subir banco', 'docker compose up -d db', 'Docker'),
        cmd('d2', 'Derrubar tudo', 'docker compose down', 'Docker'),
        cmd('n1', 'Limpar node_modules', 'rmdir /s /q node_modules && npm ci', 'Node'),
      ],
    }),
  );
  file(
    join(userData, 'projects.json'),
    JSON.stringify({
      version: 1,
      projects: [
        {
          id: 'loja',
          name: 'Loja',
          rootPath: LINK,
          defaultProfileId: 'builtin.cmd',
          types: { dotnet: true, node: true },
          variables: { project: 'src/Loja.Api/Loja.Api.csproj', startupProject: 'src/Loja.Api/Loja.Api.csproj' },
          node: { packageManagerOverrides: {} },
        },
      ],
    }),
  );
  return userData;
}

// ---------- imagens ----------

/** Converte PNG em WebP (ou redimensiona PNG) numa janela oculta do Electron. */
async function encode(app: ElectronApplication, png: Buffer, width: number, type: 'webp' | 'png', quality = 0.88): Promise<Buffer> {
  const base64 = await app.evaluate(
    async ({ BrowserWindow }, { png, width, type, quality }) => {
      const g = globalThis as unknown as { __encoder?: InstanceType<typeof BrowserWindow> };
      if (!g.__encoder || g.__encoder.isDestroyed()) {
        g.__encoder = new BrowserWindow({ show: false });
        await g.__encoder.loadURL('about:blank');
      }
      const script = `(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${png}';
        await img.decode();
        const h = Math.round(img.height * ${width} / img.width);
        const c = document.createElement('canvas');
        c.width = ${width}; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, ${width}, h);
        return c.toDataURL('image/${type}', ${quality}).split(',')[1];
      })()`;
      return (await g.__encoder.webContents.executeJavaScript(script)) as string;
    },
    { png: png.toString('base64'), width, type, quality },
  );
  return Buffer.from(base64, 'base64');
}

/** Renderiza HTML numa janela oculta e devolve o PNG (logo e imagem de compartilhamento). */
async function renderHtml(app: ElectronApplication, html: string, width: number, height: number): Promise<Buffer> {
  const base64 = await app.evaluate(
    async ({ BrowserWindow }, { html, width, height }) => {
      const win = new BrowserWindow({ show: false, width, height, useContentSize: true, transparent: true, frame: false });
      await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
      await new Promise((r) => setTimeout(r, 400));
      const image = await win.webContents.capturePage();
      win.destroy();
      return image.resize({ width, height, quality: 'best' }).toPNG().toString('base64');
    },
    { html, width, height },
  );
  return Buffer.from(base64, 'base64');
}

async function shot(app: ElectronApplication, page: Page, name: string): Promise<void> {
  await page.mouse.move(WIDTH - 2, HEIGHT - 2); // sem hover acidental
  await page.waitForTimeout(400);
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(join(SITE, 'img', `${name}.webp`), await encode(app, png, WIDTH, 'webp'));
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function type(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

async function palette(page: Page, query: string): Promise<void> {
  await page.keyboard.press('Control+P');
  await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
  await page.keyboard.type(query);
}

test('gera logo, imagem de compartilhamento e prints do site', async () => {
  const userData = createDemo();
  if (existsSync(LINK)) throw new Error(`${LINK} já existe; remova antes de capturar.`);
  const createdSrc = !existsSync(SRC);
  mkdirSync(SRC, { recursive: true });
  symlinkSync(ROOT, LINK, 'junction');
  mkdirSync(join(SITE, 'img'), { recursive: true });
  const { app, page, close } = await launchApp({ userData });
  try {
    await app.evaluate(({ BrowserWindow }, { w, h }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.unmaximize();
      win.setContentSize(w, h);
      win.center();
    }, { w: WIDTH, h: HEIGHT });

    // Logo em PNG (favicon e apple-touch-icon) e imagem de compartilhamento.
    const svg = readFileSync(join(SITE, 'logo.svg'), 'utf8');
    for (const size of [32, 64, 180, 256, 512]) {
      const html = `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
      writeFileSync(join(SITE, `logo-${size}.png`), await encode(app, await renderHtml(app, html, size, size), size, 'png'));
    }
    const og = readFileSync(join(SITE, 'capture', 'og.html'), 'utf8').replace('{{logo}}', svg);
    writeFileSync(join(SITE, 'og-image.png'), await encode(app, await renderHtml(app, og, 1200, 630), 1200, 'png'));

    // 1. Tela principal: projeto aberto, log colorido à esquerda e Git à direita.
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.getByRole('button', { name: 'Projetos' }).click();
    await page.getByTestId('project-item').getByRole('button', { name: 'Abrir' }).click();
    await expect(page.getByTestId('status-project')).toContainText('Loja');
    await expect.poll(() => bufferText(page)).toMatch(/Loja>\s*$/);
    await type(page, 'cls');
    await type(page, String.raw`.\iniciar-api`);
    await expect.poll(() => bufferText(page)).toMatch(/Pedido 4823 confirmado/);
    await page.keyboard.press('Alt+Shift+=');
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await type(page, 'git log --oneline --decorate -3');
    await expect.poll(() => bufferText(page)).toMatch(/Pedidos com gateway[\s\S]*>\s*$/);
    await type(page, 'git status --short');
    await expect.poll(() => bufferText(page)).toMatch(/pedidos\.ts/);
    await expect(page.getByTestId('status-git')).toContainText('feature/pedidos', { timeout: 15_000 });
    await page.keyboard.press('Alt+ArrowLeft');
    await shot(app, page, 'principal');

    // 2. Paleta: comandos do EF Core e dos perfis de execução.
    await palette(page, 'migra');
    await expect(page.getByTestId('palette-item').first()).toBeVisible();
    await shot(app, page, 'paleta');
    await page.keyboard.press('Escape');

    // 3. Executor de testes (Vitest) com uma falha.
    await palette(page, 'executor de testes');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tests-panel')).toBeVisible();
    await page.getByLabel('Alvo de teste').selectOption({ index: 0 });
    for (let i = 0; i < (await page.getByLabel('Alvo de teste').locator('option').count()); i++) {
      const label = await page.getByLabel('Alvo de teste').locator('option').nth(i).textContent();
      if (label?.includes('Vitest') || label?.includes('Node')) {
        await page.getByLabel('Alvo de teste').selectOption({ index: i });
        break;
      }
    }
    await page.getByTestId('tests-panel').getByRole('button', { name: 'Rodar', exact: true }).click();
    await expect(page.getByTestId('tests-summary')).toContainText('1 com falha', { timeout: 120_000 });
    await shot(app, page, 'testes');
    await page.keyboard.press('Escape');

    // 4. Docker e portas: um servidor iniciado numa aba aparece com a aba dona.
    await page.keyboard.press('Control+T');
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    // A aba nova abre na pasta do usuário; vai para o projeto sem deixar o caminho real na tela.
    await type(page, `cd /d ${LINK} && cls`);
    await expect.poll(() => bufferText(page)).toMatch(/^C:\\src\\Loja>\s*$/m);
    await type(page, `node -e "require('http').createServer().listen(5270, '127.0.0.1', () => console.log('API_OUVINDO'))"`);
    await expect.poll(() => bufferText(page), { timeout: 20_000 }).toMatch(/^API_OUVINDO$/m);
    await palette(page, 'docker e portas');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('docker-ports-panel')).toBeVisible();
    await page.getByLabel('Filtrar portas').fill('527');
    await expect(page.getByTestId('port-row').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('docker-unavailable').or(page.getByTestId('container-row').first()).or(page.getByText('Nenhum container.'))).toBeVisible({
      timeout: 40_000,
    });
    await shot(app, page, 'docker-portas');
    await page.keyboard.press('Escape');

    // 5. Cores: seletor com hexadecimal, RGB e paleta.
    await page.keyboard.press('Control+,');
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.getByRole('button', { name: 'Interface: Destaque' }).click();
    await expect(page.getByTestId('color-picker')).toBeVisible();
    await shot(app, page, 'cores');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  } finally {
    await close();
    unlinkSync(LINK); // só a junção; a pasta de demonstração fica
    if (createdSrc) rmdirSync(SRC);
  }
});
