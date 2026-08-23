import { expect, test, _electron as electron } from '@playwright/test';
import path from 'node:path';

test('opens the packaged app with the private-session dashboard', async () => {
  const executablePath = path.resolve('out', 'SFScreen-win32-x64', 'SFScreen.exe');
  const app = await electron.launch({ executablePath });
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle('SFScreen');
    await expect(window.getByText('Sua Sala Privada', { exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Convidar pessoa' })).toBeVisible();
    await expect(window.getByRole('banner').getByRole('button', { name: 'Configurações' })).toBeVisible();
    const csp = await window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('localhost');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  } finally {
    await app.close();
  }
});
