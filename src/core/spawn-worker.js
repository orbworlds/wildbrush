/**
 * Module workers that also start inside Orb's world frame. That frame is sandboxed without
 * same-origin, so its origin is "null" and `new Worker(httpsUrl)` throws there; a data: URL module
 * worker whose body imports the absolute script URL loads the same module (Orb serves world files
 * with open CORS). Messages posted right away wait until the module has run.
 */
export function spawnModuleWorker(url) {
  if (window.origin !== 'null') return new Worker(url, { type: 'module' });
  const body = `import ${JSON.stringify(url.href)};`;
  return new Worker(`data:text/javascript;charset=utf-8,${encodeURIComponent(body)}`, { type: 'module' });
}
