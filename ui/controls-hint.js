/**
 * Controls hint panel listing the keys (move, look, jump, strike, aim, lock on, colours, interact), with the Ride the brush row unlocked once the hero can fly. The list is shared with the pause menu.
 */
import { washCanvas } from './brush.js';
import { el, setClass } from './dom.js';
const CONTROLS = [
  [['W', 'A', 'S', 'D'], 'Move', ''],
  [['Mouse'], 'Look'],
  [['Space'], 'Jump · Glide'],
  [['Shift'], 'Sprint'],
  [['LMB'], 'Strike · hold to spin'],
  [['RMB', 'LMB'], 'Aim · tap flick · hold Brush Art', '+'],
  [['Q', 'MMB'], 'Lock on', '/'],
  [['Space'], 'Dodge (locked on)'],
  [['1-4', 'E'], 'Colour', '/'],
  [['Tab'], 'Colour wheel'],
  [['C'], 'Let go'],
  [['F'], 'Interact'],
];
export const CONTROL_ROWS = CONTROLS;
export const RIDE_ROW = [['R'], 'Ride the brush'];
export class ControlsHint {
  root;
  visible = false;
  ride = null;
  constructor(host) {
    this.root = el('div', 'wb-hint off', host);
    const back = washCanvas(26, 14, 'hint-back', 0.72);
    back.className = 'hn-back';
    this.root.appendChild(back);
    el('div', 'hn-head', this.root, 'Controls<small>H to hide</small>');
    for (const [keys, label, joiner] of [...CONTROLS, RIDE_ROW]) {
      const row = el('div', 'hn-row', this.root);
      const keysEl = el('div', 'hn-keys', row);
      keys.forEach((key, i) => {
        if (i > 0 && joiner) el('span', 'hn-join', keysEl, joiner);
        el('span', `wb-key${key.length > 1 ? ' wide' : ''}`, keysEl, key);
      });
      el('span', 'hn-lbl', row, label);
      if (label === RIDE_ROW[1]) {
        row.classList.add('hn-ride', 'locked');
        this.ride = row;
      }
    }
  }
  setRide(ride) {
    if (this.ride) setClass(this.ride, 'locked', !ride);
  }
  set(visible) {
    if (visible !== this.visible) {
      this.visible = visible;
      setClass(this.root, 'off', !visible);
    }
  }
  get shown() {
    return this.visible;
  }
}
