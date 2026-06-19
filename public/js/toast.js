/**
 * Toast/snackbar helper — substitui alert() por mensagens bonitas.
 *
 * Uso:
 *   toast('Palpite salvo!', 'success');
 *   toast('Erro ao salvar', 'error');
 *   toast('Atenção', 'warning');
 *   toast('Info genérica');  // tipo padrão 'info'
 */
(function() {
  // CSS inline para não depender de arquivo externo
  const style = document.createElement('style');
  style.textContent = `
    .toast-container {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: 90vw;
    }
    .toast {
      background: #333;
      color: white;
      padding: 12px 18px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.25s, transform 0.25s;
      max-width: 90vw;
      font-size: 0.9rem;
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 200px;
      max-width: 500px;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast-error { background: #c0392b; }
    .toast-success { background: #27ae60; }
    .toast-warning { background: #f39c12; }
    .toast-info { background: #2980b9; }
    .toast-icon { font-size: 1.1rem; flex-shrink: 0; }
    .toast-message { flex: 1; line-height: 1.3; }
    .toast-close {
      background: none; border: none; color: white; cursor: pointer;
      padding: 0 0 0 8px; font-size: 1.1rem; opacity: 0.8;
    }
    .toast-close:hover { opacity: 1; }
  `;
  document.head.appendChild(style);

  // Cria container único
  function getContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  const ICONS = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  /**
   * Mostra um toast.
   * @param {string} message - texto da mensagem
   * @param {string} type - 'success' | 'error' | 'warning' | 'info'
   * @param {number} duration - ms antes de sumir (0 = não some sozinho). Padrão 4000.
   */
  window.toast = function(message, type, duration) {
    type = type || 'info';
    duration = duration === undefined ? 4000 : duration;

    const container = getContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.setAttribute('role', 'alert');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = ICONS[type] || ICONS.info;

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;

    const close = document.createElement('button');
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Fechar');
    close.textContent = '×';
    close.onclick = function() { removeToast(el); };

    el.appendChild(icon);
    el.appendChild(msg);
    el.appendChild(close);
    container.appendChild(el);

    // animação de entrada
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { el.classList.add('show'); });
    });

    // some sozinho após duration
    if (duration > 0) {
      setTimeout(function() { removeToast(el); }, duration);
    }
    return el;
  };

  function removeToast(el) {
    if (!el || !el.parentNode) return;
    el.classList.remove('show');
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }
})();