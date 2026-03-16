import { store } from './state.js';
import { audioManager } from './audio.js';

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.activePaletteTarget = null; 
    this.mouseX = 0;
    this.mouseY = 0;
    this.isPainting = false;
    this.sprayLoop = null;
    
    this.elements = {
      btnMute: document.getElementById('btn-sound'),
      btnPause: document.getElementById('btn-pause'),
      btnLetters: document.getElementById('btn-letters'),
      btnBalls: document.getElementById('btn-balls'),
      btnFans: document.getElementById('btn-fans'),
      btnSlow: document.getElementById('btn-slow'),
      wordInput: document.getElementById('word-input'),
      beadCount: document.getElementById('bead-count'),
      loader: document.getElementById('loader'),
      btnMag: document.getElementById('btn-mag-main'),
      btnPaint: document.getElementById('btn-paint-main'),
      toolHint: document.getElementById('tool-hint')
    };
    
    this.initBindings();
    this.initStoreSubscriptions();
    this.elements.btnMute.style.color = audioManager.isMuted ? '#666' : '#00f3ff';
  }

  hideLoader() {
    this.elements.loader.style.display = 'none';
    document.body.classList.remove('loading');
  }

  startSprayEffect() {
    if (this.sprayLoop) return;

    const emit = () => {
      const colorIdx = store.get().paintToolColor;
      if (this.isPainting && colorIdx !== -1) {
        this.createSprayParticle(this.mouseX, this.mouseY, colorIdx);
        this.sprayLoop = requestAnimationFrame(emit);
      } else {
        this.sprayLoop = null;
      }
    };

    this.sprayLoop = requestAnimationFrame(emit);
  }

  createSprayParticle(mouseX, mouseY, colorIndex) {
    // Полное обнуление: метод просто возвращает управление, 
    // не создавая никаких 2D-капель на экране.
    return;
  }

  updateBeadCounter(current, max) {
    if (this.elements.beadCount) this.elements.beadCount.textContent = `${current}/${max}`;
  }

  updateFanProgress(level) {
    if (this.elements.btnFans) this.elements.btnFans.style.setProperty('--prog', (level * 100) + '%');
  }

  resetUIState(lettersEnabled) {
    this.elements.btnPause.style.color = '#00f3ff';
    this.elements.btnPause.querySelector('path').setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
    this.elements.btnLetters.classList.toggle('active-state', lettersEnabled);
    this.updateFanProgress(0);
  }

  lockLetters(isLocked) {
    const wrapper = this.elements.btnLetters.closest('.combo-wrapper');
    if (wrapper) wrapper.classList.toggle('locked', isLocked);
    if (isLocked) this.elements.btnLetters.classList.remove('active-state'); 
    
    if (this.elements.wordInput) {
      this.elements.wordInput.disabled = isLocked;
      this.elements.wordInput.style.opacity = isLocked ? '0.3' : '1';
      this.elements.wordInput.style.pointerEvents = isLocked ? 'none' : 'auto';
    }
  }

  setLettersActive(isActive) {
    this.elements.btnLetters.classList.toggle('active-state', isActive);
  }

  triggerApplyWord() {
    let newWord = this.elements.wordInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (newWord.length === 0) newWord = "GOOGLE"; 
    if (newWord.length > 8) newWord = newWord.substring(0, 8); 
    this.elements.wordInput.value = newWord;
    this.cb.onApplyWord(newWord);
  }

  closePalette() {
    document.querySelectorAll('.palette-container').forEach(p => p.classList.remove('open'));
    this.elements.btnMag.classList.remove('is-selecting');
    this.elements.btnPaint.classList.remove('is-selecting');
    this.activePaletteTarget = null;
  }

  openPalette(target) {
    this.closePalette();
    this.activePaletteTarget = target;
    const palette = document.querySelector(`.${target}-palette`);
    if (palette) palette.classList.add('open');
    this.elements.btnMag.classList.toggle('is-selecting', target === 'mag');
    this.elements.btnPaint.classList.toggle('is-selecting', target === 'paint');
  }

  initBindings() {
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.target.closest('#holo-wrapper') || e.target.closest('#hud-controls')) return;

      if (e.button === 0) {
        this.isPainting = true;
        this.startSprayEffect();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isPainting = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (store.get().currentTool !== -1 || store.get().paintToolColor !== -1) {
        e.preventDefault();
        store.update({ currentTool: -1, paintToolColor: -1 });
      }
    });

    document.addEventListener('click', (e) => {
      const btnOrLink = e.target.closest('button, .hud-btn, .icon-btn, .holo-btn, .mode-btn, .mag-main-btn, .palette-color-btn');
      if (btnOrLink) btnOrLink.blur();

      if (this.activePaletteTarget && !e.target.closest('.equipment-rack')) {
        this.closePalette();
      }

      const target = e.target.closest('[data-action]');
      if (!target) return;

      e.preventDefault();
      const action = target.dataset.action;

      switch (action) {
        case 'toggleMute':
          const currentlyMuted = audioManager.toggleMute();
          this.elements.btnMute.style.color = currentlyMuted ? '#666' : '#00f3ff';
          break;
        case 'togglePause':
          const isPaused = this.cb.onTogglePause();
          this.elements.btnPause.style.color = isPaused ? '#ff4444' : '#00f3ff';
          const path = this.elements.btnPause.querySelector('path');
          if (isPaused) path.setAttribute('d', 'M8 5v14l11-7z');
          else path.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
          break;
        case 'reset': this.cb.onReset(); break;
        case 'toggleUI': document.body.classList.toggle('ui-hidden'); this.closePalette(); break;
        case 'toggleFullscreen':
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
          else document.exitFullscreen();
          break;
        case 'applyWord': this.triggerApplyWord(); break;
        case 'setModeLab': store.update({ mode: 'lab' }); break;
        case 'setModeDisco': store.update({ mode: 'disco' }); break;
        case 'toggleLetters':
          const isEnabled = this.cb.onToggleLetters();
          this.elements.btnLetters.classList.toggle('active-state', isEnabled);
          break;
        case 'returnLetters': this.cb.onReturnLetters(); break;
        case 'spawnBalls': this.cb.onSpawnBalls(); break;
        case 'clearBalls': this.cb.onShrinkBalls(); break;
        case 'toggleSlowMo': store.update({ isSlowMo: !store.get().isSlowMo }); break;
        case 'toggleFans': this.cb.onToggleFans(); break;
        case 'togglePaletteMag':
          this.activePaletteTarget === 'mag' ? this.closePalette() : this.openPalette('mag');
          break;
        case 'togglePalettePaint':
          this.activePaletteTarget === 'paint' ? this.closePalette() : this.openPalette('paint');
          break;
        case 'selectPaletteColor':
          const colorVal = parseInt(target.dataset.color);
          if (this.activePaletteTarget === 'mag') {
            store.update({ paintToolColor: -1, currentTool: colorVal });
          } else {
            store.update({ currentTool: -1, paintToolColor: colorVal });
          }
          this.closePalette();
          break;
      }
    });

    this.elements.wordInput.addEventListener('focus', (e) => { e.target.value = ''; });
    this.elements.wordInput.addEventListener('keypress', (e) => { 
      if (e.key === 'Enter') { this.triggerApplyWord(); this.elements.wordInput.blur(); } 
    });

    document.getElementById('terminal-handle').addEventListener('click', () => { 
      const wrapper = document.getElementById('holo-wrapper');
      wrapper.classList.toggle('open');
      if (!wrapper.classList.contains('open')) this.closePalette();
    });

    document.getElementById('holo-wrapper').addEventListener('mouseleave', () => this.closePalette());

  window.addEventListener('keydown', (e) => {
      // Игнорируем нажатия, если мы печатаем текст в инпуте
      if (document.activeElement === this.elements.wordInput) return;
      
      const triggerAction = (action) => {
        const btn = document.querySelector(`[data-action="${action}"]`);
        if (btn) btn.click();
      };
      
      switch(e.code) {
        case 'Space': e.preventDefault(); triggerAction('togglePause'); break;
        // МЕНЯЕМ ESCAPE НА KEY R
        case 'KeyR': triggerAction('reset'); break; 
        case 'KeyM': triggerAction('toggleMute'); break;
        case 'KeyH': triggerAction('toggleUI'); break;
      }
    });
  }

  initStoreSubscriptions() {
    store.subscribe((state) => {
      document.getElementById('mode-lab').classList.toggle('active', state.mode === 'lab'); 
      document.getElementById('mode-disco').classList.toggle('active', state.mode === 'disco'); 
      this.elements.btnSlow.classList.toggle('active-state', state.isSlowMo);

      const magMainBtn = document.getElementById('btn-mag-main');
      magMainBtn.classList.remove('mag-color-0', 'mag-color-1', 'mag-color-2', 'mag-color-3');
      document.body.classList.remove('tool-mag-0', 'tool-mag-1', 'tool-mag-2', 'tool-mag-3');
      if (state.currentTool !== -1) {
        document.body.classList.add(`tool-mag-${state.currentTool}`);
        magMainBtn.classList.add(`mag-color-${state.currentTool}`);
      }
      
      const paintBtn = document.getElementById('btn-paint-main');
      paintBtn.classList.remove('paint-color-0', 'paint-color-1', 'paint-color-2', 'paint-color-3');
      document.body.classList.remove('tool-paint-0', 'tool-paint-1', 'tool-paint-2', 'tool-paint-3');
      if (state.paintToolColor !== -1) {
        document.body.classList.add(`tool-paint-${state.paintToolColor}`);
        paintBtn.classList.add(`paint-color-${state.paintToolColor}`);
      }
      if (this.elements.toolHint) {
        this.elements.toolHint.classList.toggle('visible', state.currentTool !== -1 || state.paintToolColor !== -1);
      }
    });
  }
}