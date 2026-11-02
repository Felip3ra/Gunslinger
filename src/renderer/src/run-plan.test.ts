import { describe, expect, it } from 'vitest';
import type { ShellProfile } from '@shared/model';
import type { RunnableCommand } from '@shared/runnable';
import { initialValues, planCwd, planTarget, type PlanContext } from './run-plan';

const profile = (id: string, shellType: ShellProfile['shellType'], available = true): ShellProfile => ({
  id, name: id, shellType, executable: 'x', args: [], cwd: null, color: '#000000', icon: 'x', source: 'detected', hidden: false, available, shellIntegration: true,
});
const profiles = [profile('builtin.cmd', 'cmd'), profile('builtin.gitbash', 'gitbash'), profile('custom.x', 'custom', false)];
const cmd = (partial: Partial<RunnableCommand> = {}): RunnableCommand => ({
  id: 'c', source: 'saved', title: 't', text: 'echo', description: '', group: '', cwd: null, targetProfileId: null, projectId: null, variables: {}, confirm: false, preflight: [], ...partial,
});
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  activeTab: { key: 'tab-1', profileId: 'builtin.cmd', projectId: null, running: true, cwd: 'C:\\' },
  profiles,
  projects: [{ id: 'p1', name: 'Loja', rootPath: 'C:\\src', defaultProfileId: 'builtin.gitbash', types: { dotnet: true, node: false }, variables: { project: 'a.csproj' }, node: { packageManagerOverrides: {} } }],
  defaultProfileId: 'builtin.cmd',
  ...over,
});

describe('planTarget', () => {
  it('sem destino: aba ativa', () => {
    expect(planTarget(cmd(), ctx()).target).toMatchObject({ tabKey: 'tab-1' });
  });

  it('destino diferente: aba nova com o perfil pedido', () => {
    expect(planTarget(cmd({ targetProfileId: 'builtin.gitbash' }), ctx()).target).toMatchObject({ tabKey: null, profile: { id: 'builtin.gitbash' } });
  });

  it('destino ausente: usa o padrão e pede confirmação', () => {
    const plan = planTarget(cmd({ targetProfileId: 'custom.x' }), ctx());
    expect(plan.missingProfileId).toBe('custom.x');
    expect(plan.target).toMatchObject({ tabKey: 'tab-1', profile: { id: 'builtin.cmd' } });
  });

  it('comando de projeto fora do projeto: aba nova com o shell do projeto', () => {
    expect(planTarget(cmd({ source: 'ef', projectId: 'p1' }), ctx()).target).toMatchObject({ tabKey: null, profile: { id: 'builtin.gitbash' }, projectId: 'p1' });
  });

  it('aba encerrada não recebe comandos', () => {
    const activeTab = { key: 'tab-1', profileId: 'builtin.cmd', projectId: null, running: false, cwd: null };
    expect(planTarget(cmd(), ctx({ activeTab })).target).toMatchObject({ tabKey: null });
  });
});

describe('planCwd', () => {
  const existing = { tabKey: 'tab-1', profile: profiles[1]!, projectId: null };
  it('aba nova nasce na pasta', () => {
    expect(planCwd('C:\\x', { ...existing, tabKey: null }, null)).toEqual({ kind: 'newTabIn', cwd: 'C:\\x' });
  });
  it('mesma pasta não pergunta', () => {
    expect(planCwd('c:\\x\\', existing, 'C:\\x')).toEqual({ kind: 'none' });
  });
  it('outra pasta: pergunta com o comando do shell', () => {
    expect(planCwd('C:\\x y', existing, 'C:\\')).toEqual({ kind: 'askCd', cwd: 'C:\\x y', cdCommand: "cd '/c/x y'" });
  });
  it('shell desconhecido: aba nova na pasta', () => {
    expect(planCwd('C:\\x', { ...existing, profile: profiles[2]! }, 'C:\\')).toEqual({ kind: 'newTabIn', cwd: 'C:\\x' });
  });
});

describe('initialValues', () => {
  it('variáveis do projeto primeiro, depois o padrão', () => {
    const c = cmd({ text: 'x {project} {nome} {n2}', variables: { nome: { default: 'Add', options: [] } } });
    expect(initialValues(c, { project: 'a.csproj' })).toEqual({ values: { project: 'a.csproj', nome: 'Add', n2: '' }, fromProject: ['project'] });
  });
});
