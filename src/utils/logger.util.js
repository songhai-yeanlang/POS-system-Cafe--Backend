const info = (message, ...args) => console.log(`[INFO] ${new Date().toLocaleString()}: ${message}`, ...args);
const warn = (message, ...args) => console.warn(`[WARN] ${new Date().toLocaleString()}: ${message}`, ...args);
const error = (message, ...args) => console.error(`[ERROR] ${new Date().toLocaleString()}: ${message}`, ...args);

module.exports = { info, warn, error };