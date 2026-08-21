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
    await expect.poll(() => window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("default-src 'self'");
  } finally {
    await app.close();
  }
});
