import { useEffect, useState } from 'react';
import { Janela, Campo, Botao, Tabela, useToast } from '@mercado/shared';
import { api } from './api.js';

const FORM_VAZIO = { username: '', senha: '', role: 'caixa', filial: '' };
const FILIAIS = { par: 'Parnamirim', mac: 'Macaíba', nat: 'Natal' };

export default function Funcionarios() {
  const toast = useToast();
  const [lista, setLista] = useState([]);
  const [modal, setModal] = useState(null); // null | 'novo' | {id,...} editar | {id,...} senha
  const [form, setForm] = useState(FORM_VAZIO);
  const [novaSenha, setNovaSenha] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(null);

  const carregar = async () => {
    try { setLista(await api('/funcionarios')); } catch (e) { toast(e.message); }
  };
  useEffect(() => { carregar(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    try {
      if (modal === 'novo') {
        await api('/funcionarios', { method: 'POST', body: form });
        toast('Funcionário criado.');
      } else {
        await api(`/funcionarios/${modal.id}`, { method: 'PUT', body: { role: form.role, filial: form.filial, ativo: true } });
        toast('Funcionário atualizado.');
      }
      setModal(null); carregar();
    } catch (e) { toast(e.message); }
  }

  async function trocarSenha(e) {
    e.preventDefault();
    try {
      await api(`/funcionarios/${trocandoSenha.id}/senha`, { method: 'PATCH', body: { novaSenha } });
      toast(`Senha de <b>${trocandoSenha.username}</b> redefinida.`);
      setTrocandoSenha(null); setNovaSenha('');
    } catch (e) { toast(e.message); }
  }

  async function desativar(f) {
    if (!confirm(`Desativar ${f.username}?`)) return;
    try { await api(`/funcionarios/${f.id}`, { method: 'DELETE' }); toast('Funcionário desativado.'); carregar(); }
    catch (e) { toast(e.message); }
  }

  function abrirEditar(f) {
    setForm({ username: f.username, senha: '', role: f.role, filial: f.filial || '' });
    setModal(f);
  }

  return (
    <>
      <Janela titulo="Gerenciar Funcionários">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <Botao primario onClick={() => { setForm(FORM_VAZIO); setModal('novo'); }}>+ Novo Funcionário</Botao>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 420, border: '1px solid var(--linha)', borderRadius: 6 }}>
          <Tabela
            colunas={[
              { chave: 'username', rotulo: 'Usuário' }, { chave: 'role', rotulo: 'Perfil' },
              { chave: 'filial', rotulo: 'Filial' }, { chave: 'ativo', rotulo: 'Ativo' },
              { chave: 'acoes', rotulo: '' },
            ]}
            dados={lista}
            renderLinha={(f) => (
              <tr key={f.id} style={{ opacity: f.ativo ? 1 : 0.5 }}>
                <td><b>{f.username}</b></td>
                <td>{f.role === 'gestao' ? 'Gestão' : 'Caixa'}</td>
                <td>{f.filial ? (FILIAIS[f.filial] || f.filial) : '—'}</td>
                <td style={{ color: f.ativo ? 'var(--verde)' : 'var(--cinza)' }}>{f.ativo ? 'Sim' : 'Não'}</td>
                <td style={{ whiteSpace: 'nowrap', display: 'flex', gap: 4 }}>
                  <button onClick={() => abrirEditar(f)} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--linha)', borderRadius: 4, background: 'var(--amarelo-bg)', cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => { setTrocandoSenha(f); setNovaSenha(''); }} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--linha)', borderRadius: 4, background: '#e8f0fe', cursor: 'pointer' }}>Senha</button>
                  {f.ativo && <button onClick={() => desativar(f)} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--linha)', borderRadius: 4, background: '#fee', color: '#c00', cursor: 'pointer' }}>Desativar</button>}
                </td>
              </tr>
            )}
          />
        </div>
      </Janela>

      {/* Modal novo / editar */}
      {modal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,61,.55)', display: 'grid', placeItems: 'center', padding: 14, zIndex: 200 }}
          onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div style={{ width: '100%', maxWidth: 460 }}>
            <Janela titulo={modal === 'novo' ? 'Novo Funcionário' : `Editar ${modal.username}`}>
              <form onSubmit={salvar}>
                {modal === 'novo' && (
                  <Campo label="Nome de usuário *" value={form.username} onChange={set('username')} required autoFocus />
                )}
                {modal === 'novo' && (
                  <Campo label="Senha inicial * (mín. 4 char)" type="password" value={form.senha} onChange={set('senha')} required minLength={4} />
                )}
                <Campo label="Perfil">
                  <select value={form.role} onChange={set('role')}>
                    <option value="caixa">Caixa (vendas)</option>
                    <option value="gestao">Gestão (acesso total)</option>
                  </select>
                </Campo>
                <Campo label="Filial padrão">
                  <select value={form.filial} onChange={set('filial')}>
                    <option value="">— todas —</option>
                    {Object.entries(FILIAIS).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                  </select>
                </Campo>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <Botao type="button" onClick={() => setModal(null)}>Cancelar</Botao>
                  <Botao primario type="submit">Salvar</Botao>
                </div>
              </form>
            </Janela>
          </div>
        </div>
      )}

      {/* Modal redefinir senha */}
      {trocandoSenha && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,61,.55)', display: 'grid', placeItems: 'center', padding: 14, zIndex: 200 }}
          onClick={(e) => e.target === e.currentTarget && setTrocandoSenha(null)}>
          <div style={{ width: '100%', maxWidth: 380 }}>
            <Janela titulo={`Redefinir senha — ${trocandoSenha.username}`}>
              <form onSubmit={trocarSenha}>
                <Campo label="Nova senha * (mín. 4 caracteres)" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required minLength={4} autoFocus />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <Botao type="button" onClick={() => setTrocandoSenha(null)}>Cancelar</Botao>
                  <Botao primario type="submit">Redefinir</Botao>
                </div>
              </form>
            </Janela>
          </div>
        </div>
      )}
    </>
  );
}
