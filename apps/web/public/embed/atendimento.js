/* ============================================================
 * Widget de chat de atendimento (Recepção IA) — OneClick.
 * Uso no site do cliente:
 *   <script src="https://APP/embed/atendimento.js"
 *           data-slug="atendimento" data-cor="#10b981" async></script>
 * data-slug  = slug da campanha/Recepção (obrigatório na prática; default "atendimento")
 * data-cor   = cor do botão (default #10b981)
 * data-titulo= aria-label/título (default "Fale conosco")
 * data-lado  = "right" (default) | "left"
 * data-origem= rótulo de origem pra rastrear (default "site")
 * ============================================================ */
(function () {
  if (window.__ocChatWidget) return
  window.__ocChatWidget = true

  var s = document.currentScript || (function () {
    var all = document.getElementsByTagName('script')
    return all[all.length - 1]
  })()
  var origin = ''
  try { origin = new URL(s.src).origin } catch (e) { origin = '' }

  var get = function (k, d) { var v = s && s.getAttribute('data-' + k); return (v == null || v === '') ? d : v }
  var cfg = {
    slug: get('slug', 'atendimento'),
    cor: get('cor', '#10b981'),
    titulo: get('titulo', 'Fale conosco'),
    lado: get('lado', 'right') === 'left' ? 'left' : 'right',
    origem: get('origem', 'site'),
  }
  var chatUrl = origin + '/atendimento/' + encodeURIComponent(cfg.slug) +
    '?embed=1&origem=' + encodeURIComponent(cfg.origem)

  var Z = 2147483000
  var ICON_CHAT = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  var ICON_CLOSE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'

  var btn = document.createElement('button')
  btn.setAttribute('aria-label', cfg.titulo)
  btn.innerHTML = ICON_CHAT
  btn.style.cssText = 'position:fixed;bottom:20px;' + cfg.lado + ':20px;width:60px;height:60px;border-radius:50%;' +
    'border:none;cursor:pointer;background:' + cfg.cor + ';color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);' +
    'z-index:' + Z + ';display:flex;align-items:center;justify-content:center;transition:transform .15s ease;padding:0'
  btn.onmouseover = function () { btn.style.transform = 'scale(1.06)' }
  btn.onmouseout = function () { btn.style.transform = 'scale(1)' }

  var panel = document.createElement('div')
  var iframe = document.createElement('iframe')
  iframe.setAttribute('title', cfg.titulo)
  iframe.setAttribute('allow', 'clipboard-write')
  iframe.style.cssText = 'width:100%;height:100%;border:none'
  panel.appendChild(iframe)

  var open = false
  var carregado = false
  var mobile = function () { return window.matchMedia('(max-width: 480px)').matches }

  function estilizarPanel() {
    if (mobile()) {
      panel.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;border:none;overflow:hidden;' +
        'z-index:' + Z + ';background:#fff;display:' + (open ? 'block' : 'none')
    } else {
      panel.style.cssText = 'position:fixed;bottom:92px;' + cfg.lado + ':20px;width:400px;max-width:calc(100vw - 32px);' +
        'height:600px;max-height:calc(100vh - 120px);border-radius:16px;overflow:hidden;' +
        'box-shadow:0 12px 40px rgba(0,0,0,.3);z-index:' + Z + ';background:#fff;display:' + (open ? 'block' : 'none')
    }
  }

  function toggle() {
    open = !open
    if (open && !carregado) { iframe.src = chatUrl; carregado = true }
    estilizarPanel()
    btn.innerHTML = open ? ICON_CLOSE : ICON_CHAT
    // No mobile, ao abrir em tela cheia, sobe o botão pra ele não cobrir o input do chat.
    btn.style.bottom = (open && mobile()) ? 'auto' : '20px'
    btn.style.top = (open && mobile()) ? '12px' : 'auto'
  }
  btn.onclick = toggle

  // O chat pode pedir pra fechar via postMessage.
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.ocChat === 'close' && open) toggle()
  })
  window.addEventListener('resize', function () { if (open) estilizarPanel() })

  function mount() {
    estilizarPanel()
    document.body.appendChild(panel)
    document.body.appendChild(btn)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
