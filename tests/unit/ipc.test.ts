import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../../src/shared/ipc';

describe('IPC channels', () => {
  it('keeps the privileged surface narrow and stable', () => {
    expect(ipcChannels).toEqual({
      listScreenSources: 'screen:list-sources',
      exportSignalFile: 'signal:export-file',
      importSignalFile: 'signal:import-file',
    });
  });
});
