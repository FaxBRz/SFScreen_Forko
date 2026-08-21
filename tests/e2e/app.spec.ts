import { expect, test, _electron as electron } from '@playwright/test';
import path from 'node:path';

test('opens the packaged app with the private-session dashboard', async () => {
  const executablePath = path.resolve('out', 'SFScreen-win32-x64', 'SFScreen.exe');
  const app = await electron.launch({ executablePath });
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle('SFScreen');
    await expect(window.getByRole('heading', { name: 'Conecte-se com clareza.' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Criar sessão' })).toBeVisible();
    await expect(window.getByLabel('Código da sessão')).toBeVisible();
    const csp = await window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('localhost');
    expect(csp).not.toContain("style-src 'self' 'unsafe-inline'");
  } finally {
    await app.close();
  }
});
