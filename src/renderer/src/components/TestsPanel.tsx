import { useEffect, useMemo, useState } from 'react';
import type { TestCaseResult } from '@shared/test-results';
import { joinWindows } from '@shared/project-runnables';
import { activeTab, useStore } from '../store';
import { openFileLink } from '../terminal/file-links';
import { cancelTests, runTests, testTargets } from '../tests';

const STACK_LINK = /(?:in\s+)?((?:[A-Za-z]:[\\/]|\.{0,2}[\\/]?)[^\s:()]+\.\w+):(?:line\s+)?(\d+)(?::(\d+))?/;

/** Linha de stack trace com o caminho clicável (abre no editor). */
function StackLine({ line, baseDir }: { line: string; baseDir: string }): JSX.Element {
  const m = STACK_LINK.exec(line);
  if (!m) return <div>{line}</div>;
  const path = /^[A-Za-z]:/.test(m[1]!) ? m[1]! : joinWindows(baseDir, m[1]!.replace(/^\.[\\/]/, ''));
  return (
    <div>
      {line.slice(0, m.index)}
      <button className="link stack-link" onClick={() => void openFileLink(path, Number(m[2]), m[3] ? Number(m[3]) : undefined)}>
        {m[0]}
      </button>
      {line.slice(m.index + m[0].length)}
    </div>
  );
}

function TestRow({ test, onRunOnly, baseDir }: { test: TestCaseResult; onRunOnly: () => void; baseDir: string }): JSX.Element {
  const icon = test.outcome === 'passed' ? '✓' : test.outcome === 'failed' ? '✗' : '○';
  return (
    <li className={`test-row ${test.outcome}`} data-testid="test-row">
      <div className="test-head">
        <span className={`test-icon ${test.outcome}`}>{icon}</span>
        <span className="test-name">{test.name}</span>
        <small>{test.durationMs} ms</small>
        <button className="link small" onClick={onRunOnly}>
          Rodar só este
        </button>
      </div>
      {test.outcome === 'failed' && (
        <div className="test-failure">
          {test.message && <pre data-testid="test-message">{test.message}</pre>}
          {test.stack && (
            <div className="test-stack" data-testid="test-stack">
              {test.stack.split('\n').map((line, i) => (
                <StackLine key={i} line={line} baseDir={baseDir} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function TestsPanel(): JSX.Element | null {
  const open = useStore((s) => s.testsOpen);
  const run = useStore((s) => s.testRun);
  const tab = useStore(activeTab);
  const project = useStore((s) => (tab?.projectId ? s.config?.projects.projects.find((p) => p.id === tab.projectId) : undefined));
  const analysis = useStore((s) => (project ? s.projectAnalyses[project.id] : undefined));
  const targets = useMemo(() => testTargets(analysis), [analysis]);
  const [selected, setSelected] = useState(0);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useStore.getState().dialog) useStore.setState({ testsOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const close = (): void => useStore.setState({ testsOpen: false });
  const target = targets[selected];
  const baseDir = project ? (run?.target.kind === 'node' ? joinWindows(project.rootPath, run.target.dir) : project.rootPath) : '';
  const tests = run?.result?.tests.filter((t) => !onlyFailures || t.outcome === 'failed') ?? [];
  const failures = run?.result?.tests.filter((t) => t.outcome === 'failed').map((t) => t.filterName) ?? [];

  return (
    <div className="modal-backdrop">
      <div className="modal settings" role="dialog" aria-modal="true" aria-label="Executor de testes" data-testid="tests-panel">
        <header className="settings-header">
          <h2>Executor de testes{project ? `: ${project.name}` : ''}</h2>
          <button aria-label="Fechar executor de testes" onClick={close}>
            ×
          </button>
        </header>
        {!project && <p className="empty">Abra um projeto para rodar os testes dele.</p>}
        {project && targets.length === 0 && <p className="empty">Nenhum projeto de testes .NET nem pacote Node com Vitest/Jest encontrado.</p>}
        {project && targets.length > 0 && (
          <div className="tests-toolbar">
            <select aria-label="Alvo de teste" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
              {targets.map((t, i) => (
                <option key={t.label} value={i}>
                  {t.label}
                </option>
              ))}
            </select>
            {run?.running ? (
              <button onClick={() => void cancelTests()}>Cancelar</button>
            ) : (
              <>
                <button className="primary" onClick={() => target && void runTests(project.id, target.target)}>
                  Rodar
                </button>
                <button disabled={failures.length === 0} onClick={() => run && void runTests(project.id, run.target, failures)}>
                  Rodar só as falhas
                </button>
              </>
            )}
          </div>
        )}
        {run && (
          <section className="tests-result">
            <p className="tests-summary" data-testid="tests-summary">
              {run.running
                ? 'Executando…'
                : run.cancelled
                  ? 'Cancelado'
                  : run.result
                    ? `${run.result.failed} com falha, ${run.result.passed} aprovado(s), ${run.result.skipped} ignorado(s)`
                    : (run.error ?? '')}
            </p>
            {run.result && (
              <label className="checkline">
                <input type="checkbox" checked={onlyFailures} onChange={(e) => setOnlyFailures(e.target.checked)} /> Só falhas
              </label>
            )}
            <ul className="test-list">
              {tests.map((t) => (
                <TestRow key={t.name} test={t} baseDir={baseDir} onRunOnly={() => project && void runTests(project.id, run.target, [t.filterName])} />
              ))}
            </ul>
            <button className="link small" onClick={() => setShowOutput(!showOutput)}>
              {showOutput ? 'Ocultar saída' : 'Mostrar saída'}
            </button>
            {showOutput && <pre className="dialog-detail tests-output">{run.output}</pre>}
          </section>
        )}
      </div>
    </div>
  );
}
