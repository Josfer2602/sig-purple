const { join } = require('path');

/**
 * En Render / Linux, guardar Chromium dentro de server/.cache/puppeteer
 * para que persista del build al runtime. En Windows local usa el cache estándar.
 */
if (process.env.RENDER || process.platform === 'linux') {
  module.exports = {
    cacheDirectory: join(__dirname, '.cache', 'puppeteer')
  };
} else {
  module.exports = {};
}
