import { useCallback, useEffect, useState } from 'react';
import type { KnownHostView } from '@shared/model';
import { matchesFilter } from '@shared/text';
import { api } from '../../api';
import { confirmDialog, useStore } from '../../store';
import { update } from './update';

/** Agente, keepalive e tempo limite de conexão, e a lista de hosts conhecidos. */
export function SshSettings(): JSX.Element {
  const ssh = useStore((s) => s.config!.settings.ssh);
  const [known, setKnown] = useState<KnownHostView[]>([]);
  const [filter, setFilter] = useState('');
  const reload = useCallback(() => void api.invoke('knownHosts:list').then(setKnown, () => setKnown([])), []);
  useEffect(reload, [reload]);
  // known_hosts.json muda também ao confiar num host novo durante uma conexão.
  const config = useStore((s) => s.config);
  useEffect(reload, [config, reload]);

  const visible = known.map((k, index) => ({ ...k, index })).filter((k) => matchesFilter(filter, [k.host, k.keyType, k.fingerprint]));

  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Agente SSH</span>
          <select aria-label="Agente SSH" value={ssh.agent} onChange={(e) => void update(['ssh', 'agent'], e.target.value)}>
            <option value="openssh">OpenSSH do Windows (serviço ssh-agent)</option>
            <option value="pageant">Pageant (PuTTY)</option>
            <option value="off">Não usar agente</option>
          </select>
        </label>
        <label className="field">
          <span>Keepalive padrão (segundos, 0 desliga)</span>
          <input
            type="number"
            min={0}
            max={3600}
            aria-label="Keepalive padrão"
            defaultValue={ssh.keepaliveSec}
            onBlur={(e) => Number(e.target.value) !== ssh.keepaliveSec && void update(['ssh', 'keepaliveSec'], Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Tempo limite de conexão (segundos)</span>
          <input
            type="number"
            min={5}
            max={120}
            aria-label="Tempo limite de conexão"
            defaultValue={ssh.connectTimeoutSec}
            onBlur={(e) => Number(e.target.value) !== ssh.connectTimeoutSec && void update(['ssh', 'connectTimeoutSec'], Number(e.target.value))}
          />
        </label>
      </div>
      <div className="row-actions">
        <button onClick={() => useStore.setState({ overlay: null, keychainOpen: true })}>Abrir keychain…</button>
      </div>

      <h3>Hosts conhecidos</h3>
      <p className="hint">A chave de cada servidor é conferida em toda conexão. Excluir uma entrada faz a próxima conexão perguntar de novo.</p>
      <div className="row-actions">
        <input placeholder="Buscar" aria-label="Buscar hosts conhecidos" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button
          onClick={async () => {
            const r = await api.invoke('knownHosts:importOpenSsh');
            const store = useStore.getState();
            if (!r.ok) store.pushNotice('error', r.error);
            else store.pushNotice('info', `${r.added} entrada(s) importada(s)${r.ignored ? `, ${r.ignored} ignorada(s)` : ''}.`);
            reload();
          }}
        >
          Importar ~/.ssh/known_hosts
        </button>
      </div>
      {known.length === 0 && <p className="empty">Nenhum host conhecido ainda.</p>}
      <ul className="project-list" data-testid="known-hosts">
        {visible.map((k) => (
          <li key={`${k.index}-${k.fingerprint}`} data-testid="known-host">
            <div>
              <strong>
                {k.host}
                {k.port !== 22 && `:${k.port}`}
                {k.revoked && <span className="warn-text"> · revogada</span>}
              </strong>
              <small>
                {k.keyType} {k.fingerprint}
              </small>
              <small>Aceito em {new Date(k.addedAt).toLocaleString('pt-BR')}</small>
            </div>
            <div className="row-actions">
              <button
                onClick={async () => {
                  if (!(await confirmDialog('Excluir host conhecido', `Excluir a chave de ${k.host}? A próxima conexão vai pedir confirmação.`, 'Excluir'))) return;
                  const r = await api.invoke('knownHosts:delete', { index: k.index });
                  if (!r.ok) useStore.getState().pushNotice('error', r.error);
                  reload();
                }}
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
