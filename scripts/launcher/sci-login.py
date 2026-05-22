"""
Login automatizado no SCI Único (UNICO.EXE).

Uso:  python sci-login.py <usuario> <senha>

Estratégia em camadas (cai pro fallback se a anterior falhar):

  1) UIA — encontra a janela do Único, localiza os 2 campos Edit pelo
     control_type, preenche cada um diretamente e clica "Entrar".
     Funciona em apps WinForms/WPF, MAS o SCI Único é Electron que NÃO expõe
     accessibility tree por default — então provavelmente vai pro plano B.

  2) Clique em coordenadas relativas — após detectar a janela e tamanho,
     clica nas coordenadas observadas onde estão os campos visualmente
     (Usuário ~42% / 16% da janela, Senha ~42% / 20%, Entrar ~45% / 27%).
     Robusto pra Electron sem accessibility.

  3) SendKeys puro — último recurso. Assume foco já está no Usuário,
     envia: usuário → TAB → senha → ENTER.

Logs em %TEMP%\\sci-login.log (mode='w' = sobrescreve a cada execução).

Requer:  python -m pip install pywinauto

Exit codes:
  0 = sucesso
  2 = uso incorreto (args faltando)
  3 = pywinauto não instalado
  4 = janela do Único não encontrada em 30s
  5 = login não pôde ser preenchido (todos backends falharam)
"""
import os
import sys
import time
import tempfile
import logging

# Logging em arquivo + stderr pra debug
LOG_PATH = os.path.join(tempfile.gettempdir(), 'sci-login.log')
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_PATH, mode='w', encoding='utf-8'),
        logging.StreamHandler(sys.stderr),
    ],
)
log = logging.getLogger('sci-login')


def main():
    log.info('=== início ===')
    log.info('Log salvo em: %s', LOG_PATH)

    if len(sys.argv) < 3:
        log.error('Uso: sci-login.py <usuario> <senha>')
        sys.exit(2)

    usuario = sys.argv[1]
    senha = sys.argv[2]
    log.info('Usuario fornecido: %r (len=%d), senha (len=%d)', usuario, len(usuario), len(senha))

    try:
        from pywinauto.application import Application
        from pywinauto.keyboard import send_keys
        from pywinauto import findwindows
    except ImportError:
        log.error('pywinauto não instalado. Rode: python -m pip install pywinauto')
        sys.exit(3)

    # 1) Localiza janela do Único — espera até 30s.
    log.info('Aguardando janela do Único (timeout 30s)...')
    deadline = time.time() + 30
    window = None
    while time.time() < deadline:
        try:
            handles = findwindows.find_windows(
                title_re=r'(?i).*(único|unico|UNICO|SCI).*',
                top_level_only=True,
            )
            if handles:
                app = Application(backend='uia').connect(handle=handles[0])
                window = app.window(handle=handles[0])
                if window.exists():
                    log.info('Janela encontrada (handle=%s): %r', handles[0], window.window_text())
                    break
        except Exception as e:
            log.debug('tentativa falhou: %s', e)
        time.sleep(0.5)

    if not window:
        log.error('Janela do Único não encontrada em 30s')
        sys.exit(4)

    initial_handle = window.handle
    try:
        window.set_focus()
        time.sleep(0.5)
    except Exception as e:
        log.warning('set_focus falhou: %s', e)

    # Tenta trazer pra foreground via API Win32 (robusta pra Electron)
    foreground(window.handle)
    time.sleep(0.5)

    sucesso = False

    # ─── Backend 1: UIA Edit ──────────────────────────────────
    try:
        edits = window.descendants(control_type='Edit')
        log.info('Backend UIA: %d campos Edit encontrados', len(edits))
        if len(edits) >= 2:
            edits[0].set_focus(); time.sleep(0.2)
            send_keys(usuario, with_spaces=True, pause=0.02)
            time.sleep(0.2)
            edits[1].set_focus(); time.sleep(0.2)
            send_keys(senha, with_spaces=True, pause=0.02)
            time.sleep(0.2)
            clicked_btn = False
            for btn in window.descendants(control_type='Button'):
                try:
                    txt = (btn.window_text() or '').lower()
                except Exception:
                    txt = ''
                if any(k in txt for k in ('entrar', 'acessar', 'login', 'ok')):
                    log.info('UIA: clicando botão %r', btn.window_text())
                    btn.click(); clicked_btn = True; break
            if not clicked_btn:
                log.info('UIA: botão Entrar não encontrado, enviando ENTER')
                send_keys('{ENTER}')
            sucesso = True
    except Exception as e:
        log.warning('Backend UIA falhou: %s', e)

    # ─── Backend 2: Clique em coordenadas relativas ──────────
    # Pra Electron sem accessibility, é o caminho mais confiável.
    # IMPORTANTE: maximizamos a janela primeiro pra que as proporções
    # calibradas (em ~1920x1080) sempre batam com qualquer monitor.
    if not sucesso:
        try:
            log.info('Backend 2: maximizando janela antes do click')
            import ctypes
            ctypes.windll.user32.ShowWindow(window.handle, 3)  # SW_MAXIMIZE
            time.sleep(1.0)  # aguarda layout estabilizar
            foreground(window.handle)
            time.sleep(0.3)

            rect = window.rectangle()
            width = rect.right - rect.left
            height = rect.bottom - rect.top
            log.info('Janela maximizada: %dx%d em (%d,%d)', width, height, rect.left, rect.top)

            # Coordenadas calibradas com base no screenshot real (janela 1334x860).
            # Card login fica em x~750-960, y~100-335 da janela completa.
            # Center horizontal do card ≈ 54% da janela; campos em y 7.5%/12.8%/17.7%.
            coord_usuario = (int(width * 0.540), int(height * 0.226))
            coord_senha   = (int(width * 0.540), int(height * 0.278))
            coord_entrar  = (int(width * 0.540), int(height * 0.328))
            log.info('Coords: usuario=%s senha=%s entrar=%s', coord_usuario, coord_senha, coord_entrar)

            # Garante foreground antes de cada click
            foreground(window.handle)
            time.sleep(0.3)

            # Click triplo no campo Usuário (3-click seleciona conteúdo todo,
            # mais seguro que Ctrl+A em Electron que pode disparar atalhos).
            log.info('Backend 2: triple-click no Usuário em %s', coord_usuario)
            window.click_input(coords=coord_usuario, button='left', double=False)
            time.sleep(0.15)
            window.click_input(coords=coord_usuario, button='left', double=True)
            time.sleep(0.4)
            log.info('Backend 2: digitando usuario')
            send_keys(usuario, with_spaces=True, pause=0.04)
            time.sleep(0.4)

            # Re-garantir foreground antes de cada interação
            foreground(window.handle)
            time.sleep(0.2)

            log.info('Backend 2: triple-click na Senha em %s', coord_senha)
            window.click_input(coords=coord_senha, button='left', double=False)
            time.sleep(0.15)
            window.click_input(coords=coord_senha, button='left', double=True)
            time.sleep(0.4)
            log.info('Backend 2: digitando senha')
            send_keys(senha, with_spaces=True, pause=0.04)
            time.sleep(0.4)

            foreground(window.handle)
            time.sleep(0.2)

            log.info('Backend 2: click em Entrar em %s', coord_entrar)
            window.click_input(coords=coord_entrar)
            sucesso = True
        except Exception as e:
            log.warning('Backend 2 (coords) falhou: %s', e)

    # ─── Backend 3: SendKeys puro ──────────────────────────────
    if not sucesso:
        try:
            log.info('Backend 3: SendKeys puro (TAB sequence)')
            foreground(window.handle)
            time.sleep(0.3)
            send_keys(usuario, with_spaces=True, pause=0.03)
            send_keys('{TAB}', pause=0.08)
            send_keys(senha, with_spaces=True, pause=0.03)
            send_keys('{ENTER}', pause=0.05)
            sucesso = True
        except Exception as e:
            log.error('SendKeys falhou: %s', e)

    if not sucesso:
        log.error('Todos os backends falharam')
        sys.exit(5)

    # Pós-login: traz nova janela pra frente
    log.info('Login enviado. Aguardando nova janela...')
    trazer_nova_janela(initial_handle=initial_handle)

    log.info('=== fim (sucesso) ===')
    sys.exit(0)


def foreground(hwnd, timeout=2):
    """Truque AttachThreadInput pra burlar bloqueio do Windows e trazer
    a janela pro primeiro plano de verdade."""
    try:
        import ctypes
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        target_pid = wintypes.DWORD()
        target_tid = user32.GetWindowThreadProcessId(hwnd, ctypes.byref(target_pid))
        current_tid = kernel32.GetCurrentThreadId()

        # Restaura se minimizada
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        user32.AttachThreadInput(target_tid, current_tid, True)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        user32.SetFocus(hwnd)
        user32.AttachThreadInput(target_tid, current_tid, False)
        return True
    except Exception as e:
        log.warning('foreground falhou: %s', e)
        return False


def trazer_nova_janela(initial_handle=None, timeout=10):
    """Após o login, aguarda nova janela do SCI aparecer e traz pro front."""
    try:
        from pywinauto import findwindows
        import ctypes
    except ImportError:
        return

    deadline = time.time() + timeout
    target = None
    while time.time() < deadline:
        try:
            handles = findwindows.find_windows(
                title_re=r'(?i).*(único|unico|UNICO|SCI).*',
                top_level_only=True,
            )
            for h in handles:
                if h == initial_handle:
                    continue
                if ctypes.windll.user32.IsWindow(h):
                    target = h
                    break
            if target:
                break
        except Exception:
            pass
        time.sleep(0.4)

    if target:
        log.info('Nova janela: handle=%s', target)
        foreground(target)
    else:
        log.warning('Nova janela não detectada em %ds', timeout)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        log.exception('Erro inesperado: %s', e)
        sys.exit(99)
