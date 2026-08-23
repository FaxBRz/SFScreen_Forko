import { expect, test, _electron as electron } from '@playwright/test';
import path from 'node:path';

test('opens the packaged app with the private-session dashboard', async ({ browserName }, testInfo) => {
  void browserName;
  const executablePath = path.resolve('out', 'SFScreen-win32-x64', 'SFScreen.exe');
  // The installed SFScreen may be alive in the tray while the packaged test
  // runs. Give this test an isolated Chromium profile so Electron's
  // single-instance lock does not make the test process exit immediately.
  const app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${testInfo.outputPath('user-data')}`],
  });
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle('SFScreen');
    await expect(window.getByText('Sua Sala Privada', { exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Criar ou entrar' })).toBeVisible();
    await expect(window.getByRole('banner').getByRole('button', { name: 'Configurações' })).toBeVisible();
    const csp = await window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('localhost');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  } finally {
    await app.close();
  }
});
