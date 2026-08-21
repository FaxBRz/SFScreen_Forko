import { BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { maxDiagnosticsBytes, type DiagnosticsReport, isDiagnosticsReport } from '../shared/diagnostics';
import { fault } from '../shared/session/errors';

export class DiagnosticsService {
  async export(webContentsId: number, report: DiagnosticsReport): Promise<boolean> {
    if (!isDiagnosticsReport(report)) throw fault('invalid-request', 'O relatório de diagnóstico é inválido.');
    const content = `${JSON.stringify(report, null, 2)}\n`;
    if (Buffer.byteLength(content, 'utf8') > maxDiagnosticsBytes) throw fault('invalid-request', 'O relatório de diagnóstico excede o limite permitido.');
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed() && candidate.webContents.id === webContentsId);
    const options = { defaultPath: 'sfscreen-diagnostico.json', filters: [{ name: 'JSON', extensions: ['json'] }] };
    const target = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (target.canceled || !target.filePath) return false;
    await writeFile(target.filePath, content, { encoding: 'utf8', flag: 'w' });
    return true;
  }
}
