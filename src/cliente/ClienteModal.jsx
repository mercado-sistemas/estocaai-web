import { useEffect, useRef, useState } from 'react';

/*
 * Janela de Clientes — lista + formulário, em React.
 *
 * Migrada pela segurança: nome, fantasia, CPF/CNPJ e observação são digitados
 * pelo usuário e antes iam para innerHTML via template string. No JSX {valor} é
 * escapado, então um nome com HTML aparece como texto, nunca executa.
 *
 * O cliente guarda só: nome, fantasia, CPF/CNPJ, celular, e-mail e observação —
 * sem telefone fixo nem endereço (esses ficam no cadastro do gestor). Não
 * conhece a API nem o estado global: recebe tudo em `ctx` (apiFetch, toast).
 */

const VAZIO = { nome: '', fantasia: '', cpfCnpj: '', celular: '', email: '', obs: '' };

export default function ClienteModal({ ctx, onClose }) {
  const { apiFetch, toast } = ctx;

  const [aba, setAba] = useState('lista'); // 'lista' | 'form'
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [editId, setEditId] = useState(null); // id em edição, ou null p/ novo
  const [form, setForm] = useState(VAZIO);
  const [gravando, setGravando] = useState(false);

  const buscaRef = useRef(null);
  const nomeRef = useRef(null);

  useEffect(() => { buscar(''); }, []); // eslint-disable-line
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (aba === 'lista') setTimeout(() => buscaRef.current?.focus(), 60);
    else setTimeout(() => nomeRef.current?.focus(), 60);
  }, [aba]);

  async function buscar(q) {
    setCarregando(true); setErro('');
    try {
      const lista = await apiFetch(`/clientes${q ? '?busca=' + encodeURIComponent(q) : ''}`);
      setClientes(lista);
      setSelId(lista[0]?.id ?? null);
    } catch (e) {
      setErro(e.message);
      setClientes([]);
    } finally {
      setCarregando(false);
    }
  }

  function novo() { setEditId(null); setForm(VAZIO); setAba('form'); }
  function editar() {
    const c = clientes.find((x) => x.id === selId);
    if (!c) return toast('Selecione um cliente para alterar.');
    setEditId(c.id);
    setForm({
      nome: c.nome || '', fantasia: c.fantasia || '', cpfCnpj: c.cpfCnpj || '',
      celular: c.celular || '', email: c.email || '', obs: c.obs || '',
    });
    setAba('form');
  }

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function gravar(e) {
    e.preventDefault();
    const nome = form.nome.trim();
    if (nome.length < 2) return toast('Nome deve ter ao menos 2 caracteres.');
    // celular é opcional; se informado, precisa ser um telefone válido (DDD + número)
    const cel = form.celular.trim();
    if (cel) {
      const d = cel.replace(/\D/g, '');
      if (d.length < 10 || d.length > 11 || cel.length > 20) {
        return toast('Celular inválido: informe DDD + número (10 ou 11 dígitos).');
      }
    }
    const body = {
      nome,
      fantasia: form.fantasia.trim(),
      cpfCnpj: form.cpfCnpj.trim(),
      celular: cel,
      email: form.email.trim(),
      obs: form.obs.trim(),
    };
    setGravando(true);
    try {
      if (editId) { await apiFetch(`/clientes/${editId}`, { method: 'PUT', body }); toast('Cliente atualizado.'); }
      else { await apiFetch('/clientes', { method: 'POST', body }); toast('Cliente criado.'); }
      setAba('lista');
      await buscar(busca);
    } catch (err) {
      toast(err.message);
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="janela" style={{ maxWidth: aba === 'lista' ? 900 : 640 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">
          {aba === 'lista' ? 'Clientes' : (editId ? `Alterar Cliente — ${form.nome}` : 'Incluir Cliente')}
        </div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="janela-corpo">
        {aba === 'lista' ? (
          <>
            <div className="linha-consulta" style={{ marginBottom: 10 }}>
              <input ref={buscaRef} type="text" value={busca} autoComplete="off"
                placeholder="Nome, CPF/CNPJ ou código…"
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') buscar(busca); }} />
              <button className="btn-acao" onClick={() => buscar(busca)}>Buscar</button>
            </div>

            <div className="moldura-grid" style={{ maxHeight: 260 }}>
              <table className="tabela">
                <thead><tr>
                  <th className="num">Cód</th><th>Nome/Razão</th><th>Fantasia</th><th>CPF/CNPJ</th><th>Celular</th>
                </tr></thead>
                <tbody>
                  {carregando ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
                  ) : erro ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--vermelho)', padding: 18 }}>{erro}</td></tr>
                  ) : clientes.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhum cliente encontrado.</td></tr>
                  ) : clientes.map((c) => (
                    <tr key={c.id} className={c.id === selId ? 'sel' : ''}
                      onClick={() => setSelId(c.id)} onDoubleClick={editar}>
                      <td className="num">{c.cod || c.id}</td>
                      <td>{c.nome}</td>
                      <td>{c.fantasia || '—'}</td>
                      <td>{c.cpfCnpj || '—'}</td>
                      <td>{c.celular || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grade-botoes" style={{ marginTop: 10 }}>
              <button className="btn-acao" onClick={novo}>Incluir</button>
              <button className="btn-acao" onClick={editar}>Alterar</button>
              <button className="btn-acao" onClick={() => toast('Ativar/Desativar Cliente: em breve.')}>Ativar/Desativar</button>
            </div>
            <div className="rodape-form"><button className="btn-acao primario" onClick={onClose}>(ESC) Fechar</button></div>
          </>
        ) : (
          <form onSubmit={gravar}>
            <div className="form-linha"><label>Nome/Razão *</label><input ref={nomeRef} value={form.nome} onChange={set('nome')} required /></div>
            <div className="form-linha"><label>Fantasia</label><input value={form.fantasia} onChange={set('fantasia')} /></div>
            <div className="form-linha"><label>CPF/CNPJ</label><input value={form.cpfCnpj} onChange={set('cpfCnpj')} /></div>
            <div className="form-linha"><label>Celular / WhatsApp</label><input value={form.celular} onChange={set('celular')} placeholder="(11) 98765-4321" /></div>
            <div className="form-linha"><label>E-mail</label><input type="email" value={form.email} onChange={set('email')} /></div>
            <div className="form-linha"><label>Observação</label><input value={form.obs} onChange={set('obs')} /></div>

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
