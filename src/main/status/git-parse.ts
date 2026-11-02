import type { GitStatus } from '@shared/model';

/** Interpreta `git status --porcelain=v2 --branch`. */
export function parseGitStatusV2(output: string): GitStatus {
  let oid: string | null = null;
  let head: string | null = null;
  let dirty = false;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('# branch.oid ')) oid = line.slice('# branch.oid '.length).trim();
    else if (line.startsWith('# branch.head ')) head = line.slice('# branch.head '.length).trim();
    else if (/^[12u?] /.test(line)) dirty = true; // alterado, renomeado, conflito ou não rastreado
  }
  const detached = head === '(detached)';
  return {
    branch: detached ? null : head,
    detachedSha: detached && oid && oid !== '(initial)' ? oid.slice(0, 7) : null,
    dirty,
    partial: false,
  };
}
