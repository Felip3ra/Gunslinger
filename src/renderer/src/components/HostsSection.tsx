import { useMemo, useState } from 'react';
import type { Host, HostGroup } from '@shared/model';
import { formatTarget, parseQuickConnect } from '@shared/ssh-hosts';
import { matchesFilter } from '@shared/text';
import { startOpenSshImport } from '../actions';
import { api } from '../api';
import { askDialog, confirmDialog, useStore, EMPTY } from '../store';
import { newHost, newHostGroup } from '../store/hosts-slice';
import { openSshTab } from '../tabs';

function notify(result: { ok: true } | { ok: false; error: string }): void {
  if (!result.ok) useStore.getState().pushNotice('error', result.error);
}

/** Conecta numa aba nova ou dividindo o painel ativo. */
function connect(host: Host, split?: 'row' | 'column'): void {
  const active = useStore.getState().activeKey;
  void openSshTab({ kind: 'host', hostId: host.id }, split && active ? { splitFrom: { target: active, direction: split } } : {});
}

async function deleteHost(host: Host): Promise<void> {
  const users = await api.invoke('hosts:jumpUsers', { hostId: host.id });
  const message = users.length > 0 ? `"${host.name}" é host de salto de: ${users.join(', ')}. Eles vão ficar sem salto.` : `Excluir "${host.name}"?`;
  if (await confirmDialog('Excluir host', message, 'Excluir')) notify(await api.invoke('hosts:delete', { hostId: host.id }));
}

async function deleteGroup(group: HostGroup): Promise<void> {
  const contents = await api.invoke('hosts:groupContents', { groupId: group.id });
  if (contents.hosts === 0 && contents.groups === 0) {
    if (await confirmDialog('Excluir grupo', `Excluir o grupo "${group.name}"?`, 'Excluir')) notify(await api.invoke('hosts:deleteGroup', { groupId: group.id, contents: 'moveUp' }));
    return;
  }
  const choice = await askDialog({
    title: 'Excluir grupo',
    message: `O grupo "${group.name}" tem ${contents.hosts} host(s)${contents.groups ? ` e ${contents.groups} subgrupo(s)` : ''}. O que fazer com eles?`,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Excluir tudo', value: 'deleteHosts' },
      { label: 'Mover para o grupo acima', value: 'moveUp', primary: true },
    ],
  });
  if (choice === 'moveUp' || choice === 'deleteHosts') notify(await api.invoke('hosts:deleteGroup', { groupId: group.id, contents: choice }));
}

function HostRow({ host }: { host: Host }): JSX.Element {
  const target = host.username ? `${host.username}@${host.address}` : host.address;
  return (
    <div
      className="command-row host-row"
      role="option"
      aria-selected={false}
      tabIndex={0}
      data-testid="host-row"
      title={`${target}${host.port ? `:${host.port}` : ''}`}
      onDoubleClick={() => connect(host)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          connect(host);
        }
      }}
    >
      <div className="command-main">
        <span className="command-name">
          <span className="host-dot" style={{ background: host.color ?? 'var(--text-muted)' }} aria-hidden />
          {host.name}
        </span>
        <code className="command-text">
          {target}
          {host.tags.map((t) => (
            <span key={t} className="host-tag">
              {t}
            </span>
          ))}
        </code>
      </div>
      <div className="command-actions">
        <button aria-label={`Conectar a ${host.name}`} title="Conectar" onClick={() => connect(host)}>
          ▶
        </button>
        <button aria-label={`Conectar dividindo à direita: ${host.name}`} title="Conectar dividindo à direita" onClick={() => connect(host, 'row')}>
          ◫
        </button>
        <button aria-label={`Conectar dividindo abaixo: ${host.name}`} title="Conectar dividindo abaixo" onClick={() => connect(host, 'column')}>
          ⊟
        </button>
        <button aria-label={`Editar ${host.name}`} title="Editar" onClick={() => useStore.setState({ hostDialog: host })}>
          ✎
        </button>
        <button aria-label={`Duplicar ${host.name}`} title="Duplicar" onClick={async () => notify(await api.invoke('hosts:duplicate', { hostId: host.id }))}>
          ⧉
        </button>
        <button aria-label={`Excluir ${host.name}`} title="Excluir" onClick={() => void deleteHost(host)}>
          🗑
        </button>
      </div>
    </div>
  );
}

function GroupNode({ group, groups, hosts, depth }: { group: HostGroup; groups: HostGroup[]; hosts: Host[]; depth: number }): JSX.Element | null {
  const [open, setOpen] = useState(true);
  const children = groups.filter((g) => g.parentId === group.id);
  const own = hosts.filter((h) => h.groupId === group.id);
  return (
    <section className="group host-group" data-testid="host-group" style={{ marginLeft: depth * 10 }}>
      <header className="group-header">
        <button className="group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {group.name}
        </button>
        <span className="row-actions">
          <button className="link small" title="Novo host no grupo" aria-label={`Novo host em ${group.name}`} onClick={() => useStore.setState({ hostDialog: newHost({ groupId: group.id }) })}>
            +
          </button>
          <button className="link small" title="Editar grupo" aria-label={`Editar grupo ${group.name}`} onClick={() => useStore.setState({ hostGroupDialog: group })}>
            ✎
          </button>
          <button className="link small" title="Excluir grupo" aria-label={`Excluir grupo ${group.name}`} onClick={() => void deleteGroup(group)}>
            🗑
          </button>
        </span>
      </header>
      {open && (
        <div role="listbox">
          {children.map((g) => (
            <GroupNode key={g.id} group={g} groups={groups} hosts={hosts} depth={depth + 1} />
          ))}
          {own.map((h) => (
            <HostRow key={h.id} host={h} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Hosts SSH na sidebar: grupos, busca, conexão rápida e ações. */
export function HostsSection(): JSX.Element {
  const file = useStore((s) => s.config?.hosts);
  const hosts = file?.hosts ?? EMPTY;
  const groups = file?.groups ?? EMPTY;
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('');

  const quick = useMemo(() => {
    const text = filter.trim();
    // Só oferece conexão rápida quando o texto parece um destino (tem @, : ou ponto, ou é um IP).
    if (!/[@:.]/.test(text)) return null;
    return parseQuickConnect(text);
  }, [filter]);

  const matching = useMemo(
    () => (filter.trim() ? hosts.filter((h) => matchesFilter(filter, [h.name, h.address, h.username ?? '', ...h.tags])) : hosts),
    [hosts, filter],
  );
  // Com filtro, mostra só os grupos que têm hosts encontrados (e os grupos acima deles).
  const visibleGroups = useMemo(() => {
    if (!filter.trim()) return groups;
    const keep = new Set<string>();
    for (const h of matching) {
      for (let id = h.groupId; id && !keep.has(id); id = groups.find((g) => g.id === id)?.parentId ?? null) keep.add(id);
    }
    return groups.filter((g) => keep.has(g.id));
  }, [groups, matching, filter]);
  const groupIds = new Set(visibleGroups.map((g) => g.id));
  const roots = visibleGroups.filter((g) => !g.parentId || !groupIds.has(g.parentId));
  const loose = matching.filter((h) => !h.groupId || !groups.some((g) => g.id === h.groupId));

  return (
    <section className="group hosts-section" data-testid="hosts-section">
      <header className="group-header">
        <button className="group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} Hosts
        </button>
        <span className="row-actions">
          <button className="link small" title="Novo host" aria-label="Novo host" onClick={() => useStore.setState({ hostDialog: newHost() })}>
            +
          </button>
          <button className="link small" title="Novo grupo" aria-label="Novo grupo de hosts" onClick={() => useStore.setState({ hostGroupDialog: newHostGroup() })}>
            ⊞
          </button>
          <button className="link small" title="Keychain" aria-label="Keychain" onClick={() => useStore.setState({ keychainOpen: true })}>
            🔑
          </button>
          <button className="link small" title="Importar do ~/.ssh/config" aria-label="Importar do OpenSSH" onClick={() => void startOpenSshImport()}>
            ⇩
          </button>
        </span>
      </header>
      {open && (
        <>
          <input className="hosts-filter" placeholder="Buscar ou usuário@host:porta" aria-label="Buscar hosts" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {quick && (
            <div className="command-row quick-connect" data-testid="quick-connect">
              <div className="command-main">
                <span className="command-name">Conectar a {formatTarget(quick.username, quick.address, quick.port ?? 22)}</span>
              </div>
              <div className="row-actions">
                <button
                  className="primary"
                  onClick={() => {
                    void openSshTab({ kind: 'quick', username: quick.username, address: quick.address, port: quick.port ?? 22 });
                    setFilter('');
                  }}
                >
                  Conectar
                </button>
                <button
                  title="Cadastrar como host"
                  onClick={() =>
                    useStore.setState({
                      hostDialog: newHost({ name: quick.address, address: quick.address, ...(quick.username ? { username: quick.username } : {}), ...(quick.port ? { port: quick.port } : {}) }),
                    })
                  }
                >
                  Salvar host
                </button>
              </div>
            </div>
          )}
          {hosts.length === 0 && !quick && <p className="empty">Nenhum host. Use + para cadastrar ou digite usuário@host para conectar.</p>}
          {hosts.length > 0 && matching.length === 0 && !quick && <p className="empty">Nenhum host encontrado.</p>}
          {roots.map((g) => (
            <GroupNode key={g.id} group={g} groups={visibleGroups} hosts={matching} depth={0} />
          ))}
          <div role="listbox">
            {loose.map((h) => (
              <HostRow key={h.id} host={h} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
