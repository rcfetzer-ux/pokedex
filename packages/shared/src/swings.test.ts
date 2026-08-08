import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_THRESHOLDS,
  HOUR_MS,
  classifySwing,
  computeChange,
  computeSeriesChange,
  meetsMagnitude,
  pickBaseline,
} from './swings.js';
import type { PricePoint, PriceVariant } from './types.js';

function point(ts: number, marketCents: number): PricePoint {
  return {
    cardId: 'sv3pt5-4',
    variant: 'holofoil' as PriceVariant,
    ts,
    marketCents,
    lowCents: null,
    midCents: null,
    highCents: null,
    currency: 'USD',
    source: 'test',
  };
}

describe('classifySwing', () => {
  it('suppresses penny moves no matter how large the percentage', () => {
    // 3c -> 9c is +200% and is exactly the noise we must not notify on.
    assert.equal(classifySwing(6, 2.0), 'none');
  });

  it('rates a normal percentage move by percentage', () => {
    assert.equal(classifySwing(300, 0.06), 'minor');
    assert.equal(classifySwing(500, 0.12), 'notable');
    assert.equal(classifySwing(1000, 0.25), 'major');
    assert.equal(classifySwing(2000, 0.8), 'extreme');
  });

  it('escalates a small percentage that is a large dollar move', () => {
    // $1,800 -> $1,950: only +8.3%, but $150 is real news on a chase card.
    assert.equal(classifySwing(15_000, 0.0833), 'major');
  });

  it('does not escalate on dollars when the percentage is rounding-level', () => {
    // $50,000 -> $50,300 is +0.6%: big dollars, but below the ratio gate.
    assert.equal(classifySwing(30_000, 0.006), 'none');
  });

  it('honours the absolute floor exactly at the boundary', () => {
    assert.equal(classifySwing(DEFAULT_THRESHOLDS.floorCents - 1, 5), 'none');
    assert.equal(classifySwing(DEFAULT_THRESHOLDS.floorCents, 5), 'extreme');
  });

  it('treats downward moves the same as upward ones', () => {
    assert.equal(classifySwing(-1000, -0.25), 'major');
  });
});

describe('meetsMagnitude', () => {
  it('orders magnitudes', () => {
    assert.equal(meetsMagnitude('extreme', 'major'), true);
    assert.equal(meetsMagnitude('major', 'major'), true);
    assert.equal(meetsMagnitude('notable', 'major'), false);
  });
});

describe('computeChange', () => {
  it('computes signed change and ratio', () => {
    const change = computeChange(1000, 1250);
    assert.ok(change);
    assert.equal(change.changeCents, 250);
    assert.equal(change.changeRatio, 0.25);
    assert.equal(change.direction, 'up');
    assert.equal(change.magnitude, 'major');
  });

  it('refuses to divide by a zero baseline', () => {
    // A card that had no price yesterday has not "swung" +Infinity%.
    assert.equal(computeChange(0, 500), null);
    assert.equal(computeChange(-10, 500), null);
  });

  it('reports flat when nothing moved', () => {
    const change = computeChange(1000, 1000);
    assert.equal(change?.direction, 'flat');
    assert.equal(change?.magnitude, 'none');
  });
});

describe('pickBaseline', () => {
  const now = 1_700_000_000_000;

  it('picks the newest point at or before the target', () => {
    const series = [
      point(now - 48 * HOUR_MS, 100),
      point(now - 30 * HOUR_MS, 200),
      point(now - 2 * HOUR_MS, 300),
    ];
    assert.equal(pickBaseline(series, now - 24 * HOUR_MS)?.marketCents, 200);
  });

  it('falls back to the oldest point when it is within tolerance', () => {
    const series = [point(now - 20 * HOUR_MS, 500), point(now, 800)];
    assert.equal(pickBaseline(series, now - 24 * HOUR_MS)?.marketCents, 500);
  });

  it('returns null when the only data is far newer than the window start', () => {
    const series = [point(now - 1 * HOUR_MS, 500)];
    assert.equal(pickBaseline(series, now - 24 * HOUR_MS), null);
  });

  it('tolerates an unsorted series', () => {
    const series = [point(now - 2 * HOUR_MS, 300), point(now - 30 * HOUR_MS, 200)];
    assert.equal(pickBaseline(series, now - 24 * HOUR_MS)?.marketCents, 200);
  });
});

describe('computeSeriesChange', () => {
  const now = 1_700_000_000_000;

  it('measures the trailing window against the latest price', () => {
    const series = [
      point(now - 72 * HOUR_MS, 1000),
      point(now - 25 * HOUR_MS, 2000),
      point(now - 1 * HOUR_MS, 2600),
    ];
    const change = computeSeriesChange(series, 24, { now });
    assert.ok(change);
    // Baseline is the 25h-old point, not the 72h-old one.
    assert.equal(change.fromCents, 2000);
    assert.equal(change.toCents, 2600);
    assert.equal(change.windowHours, 24);
    assert.equal(change.magnitude, 'major');
  });

  it('returns null for a single data point', () => {
    assert.equal(computeSeriesChange([point(now, 1000)], 24, { now }), null);
  });

  it('returns null when every point predates nothing to compare', () => {
    assert.equal(computeSeriesChange([], 24, { now }), null);
  });
});
