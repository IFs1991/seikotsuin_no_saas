import {
  evaluateLineBookingGate,
  type LineBookingGateDecision,
} from '@/lib/line/gate';

function decisionFor(
  lineBookingEnabled: boolean,
  credentialsActive: boolean
): LineBookingGateDecision {
  return evaluateLineBookingGate({
    globalKillSwitchEnabled: true,
    lineBookingEnabled,
    credentialsActive,
    encryptionReady: true,
  });
}

describe('LINE booking gate', () => {
  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])(
    'evaluates clinic flag=%s and credentials active=%s as enabled=%s',
    (lineBookingEnabled, credentialsActive, expectedEnabled) => {
      expect(decisionFor(lineBookingEnabled, credentialsActive).enabled).toBe(
        expectedEnabled
      );
    }
  );

  it('fails closed when the global kill switch or encryption key is unavailable', () => {
    const decision = evaluateLineBookingGate({
      globalKillSwitchEnabled: false,
      lineBookingEnabled: true,
      credentialsActive: true,
      encryptionReady: false,
    });

    expect(decision.enabled).toBe(false);
    expect(decision.disabledReasons).toEqual([
      'global_kill_switch_off',
      'encryption_key_unavailable',
    ]);
  });
});
