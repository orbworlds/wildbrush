/**
 * Keyboard, mouse and gamepad input: action bindings, per-frame pressed and released state, move and look vectors, and pointer lock.
 */
import { Vector2 } from 'three';
const KEY_BINDINGS = {
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  attack: ['Mouse0'],
  paint: ['Mouse0'],
  aim: ['Mouse2'],
  lockOn: ['KeyQ', 'Mouse1'],
  drop: ['KeyC'],
  interact: ['KeyF'],
  ride: ['KeyR'],
  colorPrev: [],
  colorNext: ['KeyE'],
  color1: ['Digit1'],
  color2: ['Digit2'],
  color3: ['Digit3'],
  color4: ['Digit4'],
  wheel: ['Tab'],
  pause: ['Escape'],
};
const PAD_BINDINGS = {
  jump: [0],
  sprint: [1],
  attack: [2],
  drop: [2],
  interact: [3],
  ride: [10],
  aim: [4],
  colorNext: [5],
  lockOn: [6],
  paint: [7],
  pause: [9],
  color1: [12],
  color2: [15],
  color3: [13],
  color4: [14],
};
const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
const STICK_DEADZONE = 0.18;
const PAD_LOOK_SPEED = 1100;
export class Input {
  canvas;
  events;
  move = new Vector2();
  lookDelta = new Vector2();
  wheel = 0;
  pointerLocked = false;
  usingGamepad = false;
  down = new Set();
  pendingPressed = new Set();
  pendingReleased = new Set();
  framePressed = new Set();
  frameReleased = new Set();
  pendingLook = new Vector2();
  pendingWheel = 0;
  padPrev = [];
  padNow = [];
  virtualMove = null;
  constructor(canvas, events) {
    this.canvas = canvas;
    this.events = events;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.keyDown(e.code);
    });
    window.addEventListener('keyup', (e) => this.keyUp(e.code));
    window.addEventListener('blur', () => {
      for (const code of this.down) this.pendingReleased.add(code);
      this.down.clear();
    });
    canvas.addEventListener('mousedown', (e) => this.keyDown(`Mouse${e.button}`));
    window.addEventListener('mouseup', (e) => this.keyUp(`Mouse${e.button}`));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.pendingLook.x += e.movementX;
        this.pendingLook.y += e.movementY;
        this.usingGamepad = false;
      }
    });
    window.addEventListener(
      'wheel',
      (e) => {
        this.pendingWheel += Math.sign(e.deltaY);
      },
      {
        passive: true,
      },
    );
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.events.emit('input:pointerlock', {
        locked: this.pointerLocked,
      });
    });
  }
  requestPointerLock() {
    if (document.pointerLockElement !== this.canvas)
      try {
        const promise = this.canvas.requestPointerLock({
          unadjustedMovement: true,
        });
        if (promise && typeof promise.catch == 'function') promise.catch(() => this.canvas.requestPointerLock());
      } catch {
        this.canvas.requestPointerLock();
      }
  }
  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  held(action) {
    for (const code of KEY_BINDINGS[action]) if (this.down.has(code)) return true;
    for (const button of PAD_BINDINGS[action] ?? []) if (this.padNow[button]) return true;
    return false;
  }
  pressed(action) {
    for (const code of KEY_BINDINGS[action]) if (this.framePressed.has(code)) return true;
    for (const button of PAD_BINDINGS[action] ?? []) if (this.padNow[button] && !this.padPrev[button]) return true;
    return false;
  }
  released(action) {
    for (const code of KEY_BINDINGS[action]) if (this.frameReleased.has(code)) return true;
    for (const button of PAD_BINDINGS[action] ?? []) if (!this.padNow[button] && this.padPrev[button]) return true;
    return false;
  }
  inject(code, isDown) {
    if (isDown) this.keyDown(code);
    else this.keyUp(code);
  }
  setVirtualMove(virtualMove) {
    this.virtualMove = virtualMove ? new Vector2(virtualMove.x, virtualMove.y) : null;
  }
  injectLook(dx, dy) {
    this.pendingLook.x += dx;
    this.pendingLook.y += dy;
  }
  beginFrame(dt) {
    this.framePressed = this.pendingPressed;
    this.frameReleased = this.pendingReleased;
    this.pendingPressed = new Set();
    this.pendingReleased = new Set();
    this.lookDelta.copy(this.pendingLook);
    this.pendingLook.set(0, 0);
    this.wheel = this.pendingWheel;
    this.pendingWheel = 0;
    const x = +!!this.anyDown(MOVE_KEYS.right) - !!this.anyDown(MOVE_KEYS.left);
    const y = +!!this.anyDown(MOVE_KEYS.forward) - !!this.anyDown(MOVE_KEYS.back);
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
    this.padPrev = this.padNow;
    this.padNow = [];
    const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((gp) => gp && gp.connected);
    if (pad) {
      this.padNow = pad.buttons.map((button) => button.pressed || button.value > 0.5);
      const lx = applyDeadzone(pad.axes[0] ?? 0);
      const ly = applyDeadzone(pad.axes[1] ?? 0);
      const rx = applyDeadzone(pad.axes[2] ?? 0);
      const ry = applyDeadzone(pad.axes[3] ?? 0);
      if (lx || ly) {
        this.move.set(lx, -ly);
        if (this.move.lengthSq() > 1) this.move.normalize();
        this.usingGamepad = true;
      }
      if (rx || ry) {
        this.lookDelta.x += rx * Math.abs(rx) * PAD_LOOK_SPEED * dt;
        this.lookDelta.y += ry * Math.abs(ry) * PAD_LOOK_SPEED * dt;
        this.usingGamepad = true;
      }
      if (this.padNow.some(Boolean)) this.usingGamepad = true;
    }
    if (this.virtualMove) this.move.copy(this.virtualMove);
  }
  endFrame() {}
  anyDown(codes) {
    for (const code of codes) if (this.down.has(code)) return true;
    return false;
  }
  keyDown(code) {
    if (!this.down.has(code)) this.pendingPressed.add(code);
    this.down.add(code);
    if (!code.startsWith('Mouse')) this.usingGamepad = false;
  }
  keyUp(code) {
    if (this.down.has(code)) this.pendingReleased.add(code);
    this.down.delete(code);
  }
}
function applyDeadzone(v) {
  return Math.abs(v) < STICK_DEADZONE ? 0 : (Math.sign(v) * (Math.abs(v) - STICK_DEADZONE)) / 0.8200000000000001;
}
