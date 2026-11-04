import { useMemo, useState } from 'react';
import { isValidHostAddress, type Host, type HostDefaults, type HostGroup, type InheritableHostField } from '@shared/model';
import { groupChain, resolveHost, resolveJumpChain, type FieldOrigin } from '@shared/ssh-hosts';
import { api } from '../api';
import { useStore, EMPTY } from '../store';
import { ColorPicker } from './ColorPicker';

/** Texto do valor herdado: "ops (herdado de Produção)" ou "22 (padrão)". */
function inheritedText(value: unknown, origin: FieldOrigin | undefined, format: (v: never) => string = String): string {
  if (value === null || value === undefined || value === '') return origin?.kind === 'group' ? `herdado de ${origin.groupName}` : 'não definido';
  const text = format(value as never);
  if (origin?.kind === 'group') return `${text} (herdado de ${origin.groupName})`;
  return `${text} (padrão)`;
}

/** Nome do grupo com o caminho ("Clientes / Acme"). */
function groupPath(group: HostGroup, groups: readonly HostGroup[]): string {
  return groupChain(group.id, groups)
    .map((g) => g.name)
    .reverse()
    .join(' / ');
}

/**
 * Campos herdáveis (porta, usuário, identidade, chave, salto, keepalive, agente), para host e grupo.
 * `inherited` traz o valor que vale quando o campo fica vazio.
 */
function DefaultsFields({
  value,
  onChange,
  inherited,
  selfHostId,
}: {
  value: HostDefaults;
  onChange(next: HostDefaults): void;
  inherited: { values: Partial<Record<InheritableHostField, unknown>>; origin: Partial<Record<InheritableHostField, FieldOrigin>> };
  selfHostId?: string;
}): JSX.Element {
  const keychain = useStore((s) => s.keychain);
  const hosts = useStore((s) => s.config?.hosts.hosts ?? EMPTY);
  const set = <K extends InheritableHostField>(field: K, v: HostDefaults[K] | undefined): void => {
    const next = { ...value };
    if (v === undefined || v === '') delete next[field];
    else next[field] = v;
    onChange(next);
  };
  const hint = (field: InheritableHostField, format?: (v: never) => string): string => inheritedText(inherited.values[field], inherited.origin[field], format);
  const identityName = (id: string): string => keychain?.identities.find((i) => i.id === id)?.name ?? 'identidade excluída';
  const keyName = (id: string): string => keychain?.keys.find((k) => k.id === id)?.name ?? 'chave excluída';
  const hostName = (id: string): string => hosts.find((h) => h.id === id)?.name ?? 'host excluído';

  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Usuário</span>
          <input aria-label="Usuário" value={value.username ?? ''} placeholder={hint('username')} onChange={(e) => set('username', e.target.value.trim() || undefined)} />
        </label>
        <label className="field">
          <span>Porta</span>
          <input
            aria-label="Porta"
            inputMode="numeric"
            value={value.port ?? ''}
            placeholder={hint('port')}
            onChange={(e) => set('port', e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Identidade</span>
          <select aria-label="Identidade" value={value.identityId ?? ''} onChange={(e) => set('identityId', e.target.value || undefined)}>
            <option value="">— {hint('identityId', identityName)} —</option>
            {keychain?.identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.username})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Chave</span>
          <select aria-label="Chave" value={value.keyId ?? ''} onChange={(e) => set('keyId', e.target.value || undefined)}>
            <option value="">— {hint('keyId', keyName)} —</option>
            {keychain?.keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({k.type.toUpperCase()})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Host de salto</span>
          <select aria-label="Host de salto" value={value.jumpHostId ?? ''} onChange={(e) => set('jumpHostId', e.target.value || undefined)}>
            <option value="">— {hint('jumpHostId', hostName)} —</option>
            {hosts
              .filter((h) => h.id !== selfHostId)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Keepalive (s)</span>
          <input
            aria-label="Keepalive"
            inputMode="numeric"
            value={value.keepaliveSec ?? ''}
            placeholder={hint('keepaliveSec')}
            onChange={(e) => set('keepaliveSec', e.target.value === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))}
          />
        </label>
      </div>
      <label className="field">
        <span>Encaminhar o agente SSH</span>
        <select
          aria-label="Encaminhar o agente SSH"
          value={value.agentForward === undefined ? '' : value.agentForward ? 'yes' : 'no'}
          onChange={(e) => set('agentForward', e.target.value === '' ? undefined : e.target.value === 'yes')}
        >
          <option value="">— {hint('agentForward', (v: boolean) => (v ? 'sim' : 'não'))} —</option>
          <option value="yes">Sim</option>
          <option value="no">Não</option>
        </select>
      </label>
    </>
  );
}

function validateDefaults(d: HostDefaults): string | null {
  if (d.port !== undefined && (!Number.isInteger(d.port) || d.port < 1 || d.port > 65535)) return 'Porta fora de 1–65535.';
  if (d.keepaliveSec !== undefined && (!Number.isInteger(d.keepaliveSec) || d.keepaliveSec > 3600)) return 'Keepalive deve ficar entre 0 e 3600 segundos.';
  return null;
}

function HostForm({ initial }: { initial: Host }): JSX.Element {
  const file = useStore((s) => s.config?.hosts);
  const keepaliveDefault = useStore((s) => s.config?.settings.ssh.keepaliveSec ?? 30);
  const [draft, setDraft] = useState<Host>(initial);
  const [tagsText, setTagsText] = useState(initial.tags.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const groups = file?.groups ?? EMPTY;
  const close = (): void => useStore.setState({ hostDialog: null });

  // Valor que vale se o campo ficar vazio: o do grupo mais próximo, ou o padrão do app.
  const inherited = useMemo(() => {
    const bare: Host = { id: draft.id || '__novo', name: draft.name || 'x', address: '127.0.0.1', groupId: draft.groupId, color: null, tags: [] };
    const r = resolveHost(bare, groups, { keepaliveSec: keepaliveDefault });
    return {
      values: { port: r.port, username: r.username, identityId: r.identityId, keyId: r.keyId, jumpHostId: r.jumpHostId, keepaliveSec: r.keepaliveSec, agentForward: r.agentForward },
      origin: r.origin,
    };
  }, [draft.groupId, draft.id, draft.name, groups, keepaliveDefault]);

  const addressError = touched && !isValidHostAddress(draft.address.trim()) ? 'Endereço inválido (use um nome DNS, IPv4 ou IPv6).' : null;
  const save = async (): Promise<void> => {
    setTouched(true);
    if (!draft.name.trim() || !isValidHostAddress(draft.address.trim())) return;
    const problem = validateDefaults(draft);
    if (problem) return setError(problem);
    const host: Host = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      name: draft.name.trim(),
      address: draft.address.trim(),
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    // Ciclo de saltos: avisa antes de mandar (o main confere de novo).
    const others = (file?.hosts ?? []).filter((h) => h.id !== host.id);
    const chain = resolveJumpChain(host.id, [...others, host], groups);
    if (!chain.ok && chain.reason !== 'missing') return setError(chain.reason === 'cycle' ? 'Os hosts de salto formam um ciclo.' : 'A cadeia de hosts de salto passa de 5 saltos.');
    const result = await api.invoke('hosts:save', host);
    if (result.ok) close();
    else setError(result.error);
  };

  return (
    <form
      className="modal wide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-form-title"
      data-testid="host-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 id="host-form-title">{initial.id ? 'Editar host' : 'Novo host'}</h2>
      <div className="field-row">
        <label className="field">
          <span>Nome *</span>
          <input autoFocus aria-label="Nome do host" aria-invalid={touched && !draft.name.trim()} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Endereço *</span>
          <input
            aria-label="Endereço"
            aria-invalid={!!addressError}
            placeholder="10.0.0.12, servidor.exemplo.com ou ::1"
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          />
          {addressError && <small className="field-error">{addressError}</small>}
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Grupo</span>
          <select aria-label="Grupo" value={draft.groupId ?? ''} onChange={(e) => setDraft({ ...draft, groupId: e.target.value || null })}>
            <option value="">Sem grupo</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {groupPath(g, groups)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tags</span>
          <input aria-label="Tags" placeholder="homolog, api" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </label>
      </div>
      <DefaultsFields value={draft} onChange={(d) => setDraft({ ...draft, ...d, ...clearMissing(draft, d) })} inherited={inherited} selfHostId={draft.id} />
      <div className="field-row">
        <ColorPicker label="Cor do host" value={draft.color ?? '#3fb950'} onChange={(color) => setDraft({ ...draft, color })} />
        {draft.color && (
          <button type="button" className="link small" onClick={() => setDraft({ ...draft, color: null })}>
            Sem cor
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={close}>
          Cancelar
        </button>
        <button type="submit" className="primary">
          Salvar
        </button>
      </div>
    </form>
  );
}

/** Campos herdáveis que o formulário esvaziou (o spread de `d` não os remove de `draft`). */
function clearMissing(draft: Host, d: HostDefaults): Partial<Host> {
  const out: Record<string, undefined> = {};
  for (const field of ['port', 'username', 'identityId', 'keyId', 'jumpHostId', 'keepaliveSec', 'agentForward'] as const) {
    if (draft[field] !== undefined && d[field] === undefined) out[field] = undefined;
  }
  return out as Partial<Host>;
}

export function HostDialog(): JSX.Element | null {
  const host = useStore((s) => s.hostDialog);
  if (!host) return null;
  return (
    <div className="modal-backdrop">
      <HostForm key={host.id || 'novo'} initial={host} />
    </div>
  );
}

function GroupForm({ initial }: { initial: HostGroup }): JSX.Element {
  const groups = useStore((s) => s.config?.hosts.groups ?? EMPTY);
  const keepaliveDefault = useStore((s) => s.config?.settings.ssh.keepaliveSec ?? 30);
  const [draft, setDraft] = useState<HostGroup>(initial);
  const [error, setError] = useState<string | null>(null);
  const close = (): void => useStore.setState({ hostGroupDialog: null });

  // Grupos que não podem ser pai: o próprio e os que estão dentro dele.
  const blocked = useMemo(() => {
    const ids = new Set(draft.id ? [draft.id] : []);
    for (let grew = true; grew; ) {
      grew = false;
      for (const g of groups) {
        if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
          ids.add(g.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [draft.id, groups]);

  const inherited = useMemo(() => {
    const bare: Host = { id: '__grupo', name: 'x', address: '127.0.0.1', groupId: draft.parentId, color: null, tags: [] };
    const r = resolveHost(bare, groups, { keepaliveSec: keepaliveDefault });
    return {
      values: { port: r.port, username: r.username, identityId: r.identityId, keyId: r.keyId, jumpHostId: r.jumpHostId, keepaliveSec: r.keepaliveSec, agentForward: r.agentForward },
      origin: r.origin,
    };
  }, [draft.parentId, groups, keepaliveDefault]);

  const save = async (): Promise<void> => {
    if (!draft.name.trim()) return setError('Informe o nome do grupo.');
    const problem = validateDefaults(draft.defaults);
    if (problem) return setError(problem);
    const result = await api.invoke('hosts:saveGroup', { ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim() });
    if (result.ok) close();
    else setError(result.error);
  };

  return (
    <form
      className="modal wide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-form-title"
      data-testid="host-group-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 id="group-form-title">{initial.id ? 'Editar grupo' : 'Novo grupo'}</h2>
      <div className="field-row">
        <label className="field">
          <span>Nome *</span>
          <input autoFocus aria-label="Nome do grupo" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Dentro de</span>
          <select aria-label="Grupo pai" value={draft.parentId ?? ''} onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })}>
            <option value="">Nenhum (raiz)</option>
            {groups
              .filter((g) => !blocked.has(g.id))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {groupPath(g, groups)}
                </option>
              ))}
          </select>
        </label>
      </div>
      <p className="hint">Hosts do grupo usam estes valores quando não definem os seus.</p>
      <DefaultsFields value={draft.defaults} onChange={(defaults) => setDraft({ ...draft, defaults })} inherited={inherited} />
      {error && <p className="field-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={close}>
          Cancelar
        </button>
        <button type="submit" className="primary">
          Salvar
        </button>
      </div>
    </form>
  );
}

export function HostGroupDialog(): JSX.Element | null {
  const group = useStore((s) => s.hostGroupDialog);
  if (!group) return null;
  return (
    <div className="modal-backdrop">
      <GroupForm key={group.id || 'novo'} initial={group} />
    </div>
  );
}
