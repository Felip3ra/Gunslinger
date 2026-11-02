import type { Project } from '@shared/model';
import { api } from './api';
import { askDialog, useStore } from './store';
import { openTab } from './tabs';

export function emptyProject(): Project {
  return {
    id: '',
    name: '',
    rootPath: '',
    defaultProfileId: null,
    types: { dotnet: false, node: false },
    variables: {},
    node: { packageManagerOverrides: {} },
  };
}

/** Analisa o projeto e passa a observar os package.json dele. */
export async function analyzeProject(project: Project): Promise<void> {
  try {
    const analysis = await api.invoke('projects:analyze', { root: project.rootPath, projectId: project.id });
    useStore.setState((s) => ({ projectAnalyses: { ...s.projectAnalyses, [project.id]: analysis } }));
  } catch (err) {
    useStore.getState().pushNotice('error', `Não foi possível analisar "${project.name}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Abre uma aba vinculada ao projeto, na pasta raiz, com o shell padrão do projeto. */
export async function openProject(project: Project): Promise<void> {
  const store = useStore.getState();
  let profileId: string | undefined;
  if (project.defaultProfileId) {
    const profile = store.profiles.find((p) => p.id === project.defaultProfileId);
    if (profile?.available) profileId = profile.id;
    else store.pushNotice('warning', 'Shell do projeto não encontrado; usando o perfil padrão.');
  }
  await openTab({ ...(profileId ? { profileId } : {}), cwd: project.rootPath, projectId: project.id });
  await analyzeProject(project);
}

/** Refaz a análise e oferece ligar tipos que passaram a existir na pasta. */
export async function reanalyzeProject(project: Project): Promise<void> {
  await analyzeProject(project);
  const analysis = useStore.getState().projectAnalyses[project.id];
  if (!analysis) return;
  const newTypes = (['dotnet', 'node'] as const).filter((t) => analysis.suggestedTypes[t] && !project.types[t]);
  if (newTypes.length === 0) return;
  const labels = newTypes.map((t) => (t === 'dotnet' ? '.NET' : 'Node.js')).join(' e ');
  const answer = await askDialog({
    title: 'Reanalisar projeto',
    message: `Foram encontrados arquivos de ${labels} em "${project.name}". Ligar ${newTypes.length > 1 ? 'esses tipos' : 'esse tipo'}?`,
    buttons: [
      { label: 'Agora não', value: 'no' },
      { label: 'Ligar', value: 'yes', primary: true },
    ],
  });
  if (answer !== 'yes') return;
  const types = { ...project.types };
  for (const t of newTypes) types[t] = true;
  const result = await api.invoke('projects:save', { ...project, types });
  if (!result.ok) useStore.getState().pushNotice('error', result.error);
}

export async function deleteProject(project: Project): Promise<boolean> {
  const linked = useStore.getState().config?.commands.commands.filter((c) => c.projectId === project.id).length ?? 0;
  const answer = await askDialog({
    title: 'Excluir projeto',
    message:
      linked > 0
        ? `"${project.name}" tem ${linked} comando(s) vinculado(s). O que fazer com eles?`
        : `Excluir o projeto "${project.name}"? Os arquivos na pasta não são alterados.`,
    buttons:
      linked > 0
        ? [
            { label: 'Cancelar', value: 'cancel' },
            { label: 'Excluir comandos', value: 'delete' },
            { label: 'Tornar globais', value: 'makeGlobal', primary: true },
          ]
        : [
            { label: 'Cancelar', value: 'cancel' },
            { label: 'Excluir', value: 'makeGlobal', primary: true },
          ],
  });
  if (answer !== 'delete' && answer !== 'makeGlobal') return false;
  const result = await api.invoke('projects:delete', { id: project.id, linkedCommands: answer });
  if (!result.ok) {
    useStore.getState().pushNotice('error', result.error);
    return false;
  }
  return true;
}

export function wireProjectEvents(): void {
  api.on('project:packagesChanged', ({ projectId, packages }) =>
    useStore.setState((s) => {
      const current = s.projectAnalyses[projectId];
      return current ? { projectAnalyses: { ...s.projectAnalyses, [projectId]: { ...current, nodePackages: packages } } } : s;
    }),
  );
}
