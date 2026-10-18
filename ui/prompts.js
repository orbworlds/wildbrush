/**
 * Key prompts: painted pills with a key cap, a line of text and an optional subline, shown and hidden by id; key codes are turned into short labels.
 */
import { strokeCanvas } from './brush.js';
import { el, setClass, setText } from './dom.js';
function keyLabel(code) {
  const names = {
    Mouse0: 'LMB',
    Mouse2: 'RMB',
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    Escape: 'Esc',
    Tab: 'Tab',
  };
  return names[code]
    ? names[code]
    : /^Key[A-Z]$/.test(code)
      ? code.slice(3)
      : /^Digit\d$/.test(code)
        ? code.slice(5)
        : code;
}
export class Prompts {
  root;
  items = new Map();
  backURL;
  constructor(host) {
    this.root = el('div', 'wb-prompts', host);
    this.backURL = strokeCanvas(18, 3.4, '#0c0d12', 'prompt-back', {
      widthFrac: 0.78,
      pts: [
        [0.03, 0.52],
        [0.5, 0.48],
        [0.97, 0.5],
      ],
      dry: 0.4,
      taperStart: 0.07,
      taperEnd: 0.12,
      core: 0.7,
      alpha: 0.82,
    }).toDataURL();
  }
  show(id, text, key, sub) {
    let item = this.items.get(id);
    if (!item || item.root.classList.contains('out')) {
      if (item) item.root.remove();
      const root = el('div', 'wb-prompt', this.root);
      const back = el('div', 'pr-back', root);
      back.style.background = `url(${this.backURL}) center / 100% 100% no-repeat`;
      const keyEl = el('span', 'wb-key', root);
      const col = el('div', 'pr-col', root);
      item = {
        root,
        key: keyEl,
        text: el('span', 'pr-text', col),
        sub: el('span', 'pr-sub', col),
      };
      this.items.set(id, item);
    }
    setText(item.text, text);
    setText(item.sub, sub ?? '');
    item.sub.style.display = sub ? '' : 'none';
    const label = key ? keyLabel(key) : '';
    setText(item.key, label);
    item.key.style.display = label ? '' : 'none';
    setClass(item.key, 'wide', label.length > 1);
  }
  hide(id) {
    const item = this.items.get(id);
    if (item) {
      this.items.delete(id);
      item.root.classList.add('out');
      setTimeout(() => item.root.remove(), 280);
    }
  }
}
