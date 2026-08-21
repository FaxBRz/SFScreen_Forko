let installed = false;

export const installWindowControls = (): void => {
  if (installed) return;
  installed = true;

  window.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button[aria-label="Tela cheia"]');
    if (!button) return;

    // React's current handler uses the DOM Fullscreen API, which is unreliable in this Electron build.
    // Capture the click before React and delegate fullscreen to BrowserWindow instead.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void window.sfscreen.toggleFullscreen();
  }, true);
};
