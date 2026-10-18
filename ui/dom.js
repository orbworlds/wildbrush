/**
 * DOM helpers for the HUD widgets: create an element in one call, and set a style, text or class only when it actually changes.
 */
export function el(tag, className, host, html) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (html !== undefined) element.innerHTML = html;
  if (host) host.appendChild(element);
  return element;
}
const styleCache = new WeakMap();
export function setStyle(elem, prop, value) {
  let props = styleCache.get(elem);
  if (!props) styleCache.set(elem, (props = {}));
  if (props[prop] !== value) {
    props[prop] = value;
    elem.style.setProperty(prop, value);
  }
}
const textCache = new WeakMap();
export function setText(elem, text) {
  if (textCache.get(elem) !== text) {
    textCache.set(elem, text);
    elem.textContent = text;
  }
}
export function setClass(elem, cls, on) {
  if (elem.classList.contains(cls) !== on) elem.classList.toggle(cls, on);
}
