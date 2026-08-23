import { app, autoUpdater, BrowserWindow, dialog } from 'electron';
import { createPublicUpdateFeedUrl, normalizeUpdateFeedUrl } from './update-config';

const firstCheckDelayMs = 15_000;
const checkIntervalMs = 4 * 60 * 60 * 1_000;

export const startWindowsAutoUpdates = (getParentWindow: () => BrowserWindow | null): (() => void) => {
  const overrideUrl = SFSCREEN_UPDATE_FEED_URL;
  const configuredUrl = overrideUrl || createPublicUpdateFeedUrl(process.platform, process.arch, app.getVersion()) || '';
  const feedUrl = normalizeUpdateFeedUrl(configuredUrl);

  if (process.platform !== 'win32' || !app.isPackaged || !feedUrl) {
    if (app.isPackaged && overrideUrl && !feedUrl) {
      console.warn('[updater] A URL de atualização embutida é inválida; o updater foi desativado.');
    }
    return () => undefined;
  }

  let checking = false;
  let stopped = false;
  let updatePromptShown = false;

  const markCheckFinished = (): void => {
    checking = false;
  };

  const handleError = (error: Error): void => {
    checking = false;
    console.warn(`[updater] Não foi possível verificar ou baixar a atualização: ${error.message}`);
  };

  const handleDownloaded = (
    _event: Electron.Event,
    _releaseNotes: string,
    releaseName: string,
  ): void => {
    checking = false;
    if (stopped || updatePromptShown) return;
    updatePromptShown = true;

    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: 'Atualização pronta',
      message: `A atualização ${releaseName || 'mais recente'} do SFScreen foi baixada.`,
      detail: 'Reinicie agora para concluir a instalação. Se escolher “Depois”, ela será aplicada ao fechar o aplicativo.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const parent = getParentWindow();
    const prompt = parent && !parent.isDestroyed()
      ? dialog.showMessageBox(parent, options)
      : dialog.showMessageBox(options);
    void prompt.then(({ response }) => {
      if (response === 0 && !stopped) autoUpdater.quitAndInstall();
    });
  };

  const checkForUpdates = (): void => {
    if (stopped || checking) return;
    checking = true;
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      handleError(error instanceof Error ? error : new Error('erro desconhecido'));
    }
  };

  autoUpdater.on('update-not-available', markCheckFinished);
  autoUpdater.on('error', handleError);
  autoUpdater.on('update-downloaded', handleDownloaded);
  autoUpdater.setFeedURL({ url: feedUrl });

  const firstCheck = setTimeout(checkForUpdates, firstCheckDelayMs);
  const interval = setInterval(checkForUpdates, checkIntervalMs);
  firstCheck.unref();
  interval.unref();

  return () => {
    stopped = true;
    clearTimeout(firstCheck);
    clearInterval(interval);
    autoUpdater.off('update-not-available', markCheckFinished);
    autoUpdater.off('error', handleError);
    autoUpdater.off('update-downloaded', handleDownloaded);
  };
};
