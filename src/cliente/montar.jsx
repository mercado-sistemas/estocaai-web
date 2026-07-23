import { createRoot } from 'react-dom/client';
import ClienteModal from './ClienteModal.jsx';

// Ponte main.js (vanilla) → React, mesmo padrão da tela de produto.
let raizAtual = null;
let containerAtual = null;

export function abrirModalCliente(ctx) {
  fecharModalCliente();

  const container = document.createElement('div');
  container.id = 'react-cliente';
  document.getElementById('mesa').appendChild(container);

  const raiz = createRoot(container);
  raizAtual = raiz;
  containerAtual = container;

  raiz.render(<ClienteModal ctx={ctx} onClose={fecharModalCliente} />);
}

export function fecharModalCliente() {
  if (raizAtual) { raizAtual.unmount(); raizAtual = null; }
  if (containerAtual) { containerAtual.remove(); containerAtual = null; }
}
