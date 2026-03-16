// js/state.js

export class StateManager {
  constructor() { 
    this.state = { mode: 'lab', isSlowMo: false, currentTool: -1, paintToolColor: -1 }; 
    this.listeners = []; 
  }
  get() { return this.state; }
  update(updates) {
    let changed = false;
    for (let key in updates) { 
      if (this.state[key] !== updates[key]) { 
        this.state[key] = updates[key]; 
        changed = true; 
      } 
    }
    if (changed) this.notify();
  }
  subscribe(listener) { this.listeners.push(listener); listener(this.state); }
  notify() { this.listeners.forEach(listener => listener(this.state)); }
}

// Экспортируем хранилище и функции-помощники
export const store = new StateManager();
export const isNight = () => store.get().mode === 'disco';
export const isSlowMo = () => store.get().isSlowMo; // <--- Вот этот парень нужен для audio.js!
export const isZeroG = () => store.get().mode === 'space';