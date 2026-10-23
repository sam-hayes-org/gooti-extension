// Karma is not an extension page. webextension-polyfill refuses to load
// unless chrome.runtime.id is set. This runs before the specs.
globalThis.chrome = globalThis.chrome || {};
globalThis.chrome.runtime = globalThis.chrome.runtime || {};
globalThis.chrome.runtime.id = globalThis.chrome.runtime.id || 'gooti-test';

function storageArea() {
  const data = {};
  return {
    get(keys) {
      if (keys == null) {
        return Promise.resolve({ ...data });
      }
      if (typeof keys === 'string') {
        return Promise.resolve({ [keys]: data[keys] });
      }
      return Promise.resolve({});
    },
    set(items) {
      Object.assign(data, items);
      return Promise.resolve();
    },
    remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete data[key];
      }
      return Promise.resolve();
    },
    clear() {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
      return Promise.resolve();
    },
  };
}

globalThis.chrome.storage = globalThis.chrome.storage || {
  local: storageArea(),
  sync: storageArea(),
  session: storageArea(),
};
