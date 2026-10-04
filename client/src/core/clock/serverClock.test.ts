import { describe, expect, it } from 'vitest';
import { createServerClock, daysBetween, istanbulDate } from './serverClock';

describe('server clock', () => {
  it('knows nothing until the first response', () => {
    const clock = createServerClock(() => 1000);
    expect(clock.now()).toBeNull();
  });

  it('advances with the monotonic timer from the last sample', () => {
    let mono = 1000;
    const clock = createServerClock(() => mono);
    clock.sync('2026-08-20T09:00:00.000Z');
    mono += 2500;
    expect(clock.now()).toBe(Date.parse('2026-08-20T09:00:02.500Z'));
  });

  it('follows the server backwards: the latest sample wins, as after a reset', () => {
    let mono = 0;
    const clock = createServerClock(() => mono);
    clock.sync('2026-08-20T09:10:00.000Z');
    mono = 100;
    clock.sync('2026-08-20T09:00:00.000Z');
    expect(clock.now()).toBe(Date.parse('2026-08-20T09:00:00.000Z'));
  });

  it('ignores a sample it cannot read', () => {
    const clock = createServerClock(() => 0);
    clock.sync('2026-08-20T09:00:00.000Z');
    clock.sync('yesterday');
    clock.sync(null);
    clock.sync(undefined);
    expect(clock.now()).toBe(Date.parse('2026-08-20T09:00:00.000Z'));
  });

  it("turns an instant into the server's Istanbul calendar date", () => {
    expect(istanbulDate(Date.parse('2026-08-20T22:30:00.000Z'))).toBe('2026-08-21');
    expect(istanbulDate(Date.parse('2026-08-20T09:00:00.000Z'))).toBe('2026-08-20');
  });

  it('counts whole days between calendar dates and refuses anything else', () => {
    expect(daysBetween('2026-08-18', '2026-08-20')).toBe(2);
    expect(daysBetween('2026-08-20', '2026-08-20')).toBe(0);
    expect(daysBetween('18/08/2026', '2026-08-20')).toBeNull();
  });
});
