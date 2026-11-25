/* global window, document */
// Applies the remembered appearance before first paint so a dark page never flashes light.
// Same rule as src/lib/theme.ts: an explicit choice wins, otherwise follow the device.
(function () {
  var choice = null;
  try {
    choice = window.localStorage.getItem('purchasing-plus.theme');
  } catch {
    // Storage unavailable (private mode): follow the device.
  }
  var theme =
    choice === 'light' || choice === 'dark'
      ? choice
      : window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
