import { describe, expect, it } from 'vitest';
import { VoiceActivityGate } from '../../src/renderer/session/voice-activity';

describe('VoiceActivityGate', () => {
  it('requires two speech samples and keeps the state for 300ms', () => {
    const gate = new VoiceActivityGate();
    expect(gate.sample(0.04)).toBe(false);
    expect(gate.sample(0.04)).toBe(true);
    for (let index = 0; index < 5; index += 1) expect(gate.sample(0.001)).toBe(true);
    expect(gate.sample(0.001)).toBe(false);
  });

  it('does not react to a quiet noise floor', () => {
    const gate = new VoiceActivityGate();
    for (let index = 0; index < 20; index += 1) expect(gate.sample(0.008)).toBe(false);
    expect(gate.speaking).toBe(false);
  });

  it('can be force-reset immediately when a microphone is muted', () => {
    const gate = new VoiceActivityGate();
    gate.sample(0.04);
    gate.sample(0.04);
    expect(gate.reset()).toBe(false);
    expect(gate.speaking).toBe(false);
  });
});
