import { createRoot } from 'react-dom/client';
import VendedorModal from './VendedorModal.jsx';

// Ponte main.js (vanilla) → React, mesmo padrão das outras telas migradas.
let raizAtual = null;
let containerAtual = null;

export function abrirModalVendedor(ctx) {
  fecharModalVendedor();

  const container = document.createElement('div');
  container.id = 'react-vendedor';
  document.getElementById('mesa').appendChild(container);

  const raiz = createRoot(container);
  raizAtual = raiz;
  containerAtual = container;

  raiz.render(<VendedorModal ctx={ctx} onClose={fecharModalVendedor} />);
}

export function fecharModalVendedor() {
  if (raizAtual) { raizAtual.unmount(); raizAtual = null; }
  if (containerAtual) { containerAtual.remove(); containerAtual = null; }
}
