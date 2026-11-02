import type { ProjectAnalysis } from '@shared/model';
import type { TestTarget } from '@shared/test-results';
import { api } from './api';
import { useStore } from './store';
import { appendOutput } from './store/tests-slice';

export interface TargetOption {
  label: string;
  target: TestTarget;
}

/** Alvos de teste do projeto analisado: projetos .NET de teste e pacotes Node com Vitest/Jest. */
export function testTargets(analysis: ProjectAnalysis | undefined): TargetOption[] {
  if (!analysis) return [];
  const dotnet = analysis.dotnet.projects
    .filter((p) => p.isTestProject)
    .map((p): TargetOption => ({ label: `.NET: ${p.path}`, target: { kind: 'dotnet', project: p.path } }));
  const node = analysis.nodePackages
    .filter((p) => p.testFramework)
    .map((p): TargetOption => ({ label: `Node (${p.testFramework}): ${p.dir || 'raiz'}`, target: { kind: 'node', dir: p.dir, framework: p.testFramework! } }));
  return [...dotnet, ...node];
}

export async function runTests(projectId: string, target: TestTarget, filter: string[] = []): Promise<void> {
  useStore.setState({ testRun: { runId: null, projectId, target, running: true, output: '', result: null, error: null, cancelled: false } });
  try {
    const { runId } = await api.invoke('tests:run', { projectId, target, ...(filter.length ? { filter } : {}) });
    useStore.setState((s) => (s.testRun ? { testRun: { ...s.testRun, runId } } : s));
  } catch (err) {
    useStore.setState((s) => (s.testRun ? { testRun: { ...s.testRun, running: false, error: err instanceof Error ? err.message : String(err) } } : s));
  }
}

export async function cancelTests(): Promise<void> {
  const runId = useStore.getState().testRun?.runId;
  if (runId) await api.invoke('tests:cancel', { runId });
}

export function wireTestEvents(): void {
  api.on('tests:output', ({ runId, data }) =>
    useStore.setState((s) => (s.testRun?.runId === runId ? { testRun: { ...s.testRun, output: appendOutput(s.testRun.output, data) } } : s)),
  );
  api.on('tests:finished', ({ runId, result, error, cancelled }) =>
    useStore.setState((s) => (s.testRun?.runId === runId ? { testRun: { ...s.testRun, running: false, result, error, cancelled } } : s)),
  );
}
