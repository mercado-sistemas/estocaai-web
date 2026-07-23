import { useEffect, useRef, useState } from 'react';

/*
 * Janela de Funcionários (vendedores/usuários) — lista + formulário, em React.
 *
 * Migrada pela segurança: o nome do funcionário é digitado e antes ia para
 * innerHTML. No JSX {nome} é escapado. Recebe tudo em `ctx` (apiFetch, toast,
 * filiais), montado pelo main.js.
 */

const VAZIO = { nome: '', senha: '', role: 'caixa', lojas: [] };

export default function VendedorModal({ ctx, onClose }) {
  const { apiFetch, toast, filiais } = ctx;

  const [aba, setAba] = useState('lista'); // 'lista' | 'form'
  const [vendedores, setVendedores] = useState([]);
  const [selId, setSelId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [busca, setBusca] = useState('');
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [gravando, setGravando] = useState(false);

  const buscaRef = useRef(null);
  const nomeRef = useRef(null);

  useEffect(() => { buscar(); }, []); // eslint-disable-line
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (aba === 'lista') setTimeout(() => buscaRef.current?.focus(), 60);
    else setTimeout(() => nomeRef.current?.focus(), 60);
  }, [aba]);

  async function buscar() {
    setCarregando(true); setErro('');
    try {
      const lista = await apiFetch('/funcionarios');
      setVendedores(lista);
      setSelId(lista[0]?.id ?? null);
    } catch (e) {
      setErro(e.message);
      setVendedores([]);
    } finally {
      setCarregando(false);
    }
  }

  function novo() { setEditId(null); setForm(VAZIO); setAba('form'); }
  function editar() {
    const v = vendedores.find((x) => x.id === selId);
    if (!v) return toast('Selecione um funcionário para alterar.');
    setEditId(v.id);
    setForm({
      nome: v.nome || '', senha: '',
      role: v.role === 'GESTAO' ? 'gestao' : 'caixa',
      lojas: v.lojas || [],
    });
    setAba('form');
  }

  const visiveis = busca.trim()
    ? vendedores.filter((v) => (v.nome || '').toLowerCase().includes(busca.trim().toLowerCase()))
    : vendedores;

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  function toggleLoja(id) {
    setForm((f) => ({ ...f, lojas: f.lojas.includes(id) ? f.lojas.filter((x) => x !== id) : [...f.lojas, id] }));
  }

  async function gravar(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome) return toast('Nome é obrigatório.');
    if (!editId && !form.senha) return toast('Senha é obrigatória para novo funcionário.');
    const body = { nome, role: form.role, lojas: form.lojas };
    if (form.senha) body.senha = form.senha;
    setGravando(true);
    try {
      if (editId) { await apiFetch(`/funcionarios/${editId}`, { method: 'PUT', body }); toast('Funcionário atualizado.'); }
      else { await apiFetch('/funcionarios', { method: 'POST', body }); toast('Funcionário criado.'); }
      setAba('lista');
      await buscar();
    } catch (err) {
      toast(err.message);
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="janela" style={{ maxWidth: aba === 'lista' ? 820 : 620 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">
          {aba === 'lista' ? 'Funcionários' : (editId ? `Alterar Funcionário — ${form.nome}` : 'Incluir Funcionário')}
        </div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="janela-corpo">
        {aba === 'lista' ? (
          <>
            <div className="linha-consulta" style={{ marginBottom: 10 }}>
              <input ref={buscaRef} type="text" placeholder="Filtrar por nome…" autoComplete="off"
                value={busca} onChange={(e) => setBusca(e.target.value)} />
              <button className="btn-acao" onClick={buscar}>Recarregar</button>
            </div>

            <div className="moldura-grid" style={{ maxHeight: 260 }}>
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Perfil</th><th>Filiais</th><th>Situação</th></tr></thead>
                <tbody>
                  {carregando ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
                  ) : erro ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--vermelho)', padding: 18 }}>{erro}</td></tr>
                  ) : visiveis.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhum funcionário encontrado.</td></tr>
                  ) : visiveis.map((v) => (
                    <tr key={v.id} className={v.id === selId ? 'sel' : ''}
                      onClick={() => setSelId(v.id)} onDoubleClick={editar}>
                      <td>{v.nome}</td>
                      <td>{v.role === 'GESTAO' ? 'Gestão' : 'Caixa'}</td>
                      <td>{(v.lojas || []).join(', ') || '—'}</td>
                      <td><b style={{ color: v.ativo !== false ? 'var(--verde)' : 'var(--vermelho)' }}>{v.ativo !== false ? 'Ativo' : 'Inativo'}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grade-botoes" style={{ marginTop: 10 }}>
              <button className="btn-acao" onClick={novo}>Incluir</button>
              <button className="btn-acao" onClick={editar}>Alterar</button>
            </div>
            <div className="rodape-form"><button className="btn-acao primario" onClick={onClose}>(ESC) Fechar</button></div>
          </>
        ) : (
          <form onSubmit={gravar}>
            <div className="form-linha"><label>Nome *</label><input ref={nomeRef} value={form.nome} onChange={set('nome')} required autoComplete="off" /></div>
            <div className="form-linha">
              <label>{editId ? 'Nova Senha' : 'Senha *'}</label>
              <input type="password" autoComplete="new-password" value={form.senha} onChange={set('senha')}
                required={!editId} minLength={6}
                placeholder={editId ? 'deixe em branco para manter' : 'mínimo 6 caracteres'} />
            </div>
            <div className="form-linha">
              <label>Perfil</label>
              <select value={form.role} onChange={set('role')}>
                <option value="caixa">Caixa</option>
                <option value="gestao">Gestão</option>
              </select>
            </div>
            {filiais.length > 0 && (
              <div className="form-linha" style={{ alignItems: 'flex-start' }}>
                <label style={{ paddingTop: 4 }}>Filiais</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', padding: '6px 0' }}>
                  {filiais.map((f) => (
                    <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                      <input type="checkbox" checked={form.lojas.includes(f.id)} onChange={() => toggleLoja(f.id)} /> {f.nome}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="rodape-form">
              <button className="btn-acao" type="button" onClick={() => setAba('lista')}>Voltar</button>
              <button className="btn-acao primario" type="submit" disabled={gravando}>{gravando ? 'Gravando…' : 'Gravar'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
