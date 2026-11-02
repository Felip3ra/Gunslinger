import { buildCdCommand, samePath } from '@shared/cd-command';
import type { Project, ShellProfile } from '@shared/model';
import { pickDefaultProfile } from '@shared/profiles';
import type { RunnableCommand } from '@shared/runnable';
import { extractVariables } from '@shared/variables';

/** Decisões de execução sem efeitos colaterais (testáveis): onde, com qual shell e em qual pasta. */

export interface TabView {
  key: string;
  profileId: string;
  projectId: string | null;
  running: boolean;
  cwd: string | null;
}

export interface PlanContext {
  activeTab: TabView | undefined;
  profiles: ShellProfile[];
  projects: Project[];
  defaultProfileId: string | null;
}

export interface Target {
  /** Aba existente que vai receber o comando, ou null para abrir uma nova. */
  tabKey: string | null;
  profile: ShellProfile;
  projectId: string | null;
}

export interface TargetPlan {
  target: Target | null;
  /** Shell de destino configurado que não existe; o alvo usa o perfil padrão e precisa de confirmação. */
  missingProfileId?: string;
}

/** Spec saved-commands, "Terminal de destino". */
export function planTarget(command: RunnableCommand, ctx: PlanContext): TargetPlan {
  const byId = (id: string | null | undefined): ShellProfile | undefined => (id ? ctx.profiles.find((p) => p.id === id) : undefined);
  const fallback = (): ShellProfile | null => pickDefaultProfile(ctx.profiles, ctx.defaultProfileId).profile;
  const tab = ctx.activeTab?.running ? ctx.activeTab : undefined;
  const tabProfile = tab ? byId(tab.profileId) : undefined;

  // Comandos gerados pelo projeto: aba vinculada ao projeto, ou aba nova com o shell do projeto.
  if (command.source !== 'saved' && command.projectId) {
    if (tab && tabProfile && tab.projectId === command.projectId) return { target: { tabKey: tab.key, profile: tabProfile, projectId: command.projectId } };
    const project = ctx.projects.find((p) => p.id === command.projectId);
    const profile = byId(project?.defaultProfileId) ?? fallback();
    return { target: profile ? { tabKey: null, profile, projectId: command.projectId } : null };
  }

  let wanted = byId(command.targetProfileId);
  let missingProfileId: string | undefined;
  if (command.targetProfileId && (!wanted || !wanted.available)) {
    const fb = fallback();
    if (!fb) return { target: null };
    wanted = fb;
    missingProfileId = command.targetProfileId;
  }
  const withMissing = (target: Target): TargetPlan => (missingProfileId ? { target, missingProfileId } : { target });

  if (tab && tabProfile && (!wanted || wanted.id === tabProfile.id)) return withMissing({ tabKey: tab.key, profile: tabProfile, projectId: tab.projectId });
  const profile = wanted ?? fallback();
  return profile ? withMissing({ tabKey: null, profile, projectId: ctx.activeTab?.projectId ?? null }) : { target: null };
}

export type CwdPlan =
  | { kind: 'none' }
  /** Abrir a aba nova já na pasta. */
  | { kind: 'newTabIn'; cwd: string }
  /** Perguntar se troca a pasta da aba existente com este comando. */
  | { kind: 'askCd'; cwd: string; cdCommand: string };

/** Pasta de execução: aba nova nasce na pasta; aba existente em outra pasta pergunta (ou abre aba nova, se o shell for desconhecido). */
export function planCwd(cwd: string | null, target: Target, tabCwd: string | null): CwdPlan {
  if (!cwd) return { kind: 'none' };
  if (!target.tabKey) return { kind: 'newTabIn', cwd };
  if (samePath(tabCwd, cwd)) return { kind: 'none' };
  const cd = buildCdCommand(target.profile.shellType, cwd);
  return cd === null ? { kind: 'newTabIn', cwd } : { kind: 'askCd', cwd, cdCommand: cd };
}

/** Valores iniciais: variáveis do projeto, depois o padrão de cada variável. */
export function initialValues(command: RunnableCommand, projectVars: Record<string, string>): { values: Record<string, string>; fromProject: string[] } {
  const values: Record<string, string> = {};
  const fromProject: string[] = [];
  for (const name of extractVariables(command.text)) {
    if (projectVars[name] !== undefined) {
      values[name] = projectVars[name]!;
      fromProject.push(name);
    } else {
      values[name] = command.variables[name]?.default ?? '';
    }
  }
  return { values, fromProject };
}
