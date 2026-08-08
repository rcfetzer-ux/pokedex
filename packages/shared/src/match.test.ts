import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeNumber, rankMatches, scoreCard, similarity } from './match.js';
import { parseCardText } from './ocr.js';
import type { ScoreTarget } from './match.js';

const charizardSVI: ScoreTarget = {
  name: 'Charizard ex',
  number: '54',
  set: { printedTotal: 165, total: 198, ptcgoCode: 'OBF' },
};

const charizardBase: ScoreTarget = {
  name: 'Charizard',
  number: '4',
  set: { printedTotal: 102, total: 102, ptcgoCode: 'BS' },
};

const venusaurBase: ScoreTarget = {
  name: 'Venusaur',
  number: '15',
  set: { printedTotal: 102, total: 102, ptcgoCode: 'BS' },
};

describe('similarity', () => {
  it('is 1 for identical names ignoring case and punctuation', () => {
    assert.equal(similarity('Farfetch’d', "farfetchd"), 1);
  });

  it('handles the accented Pokemon spelling', () => {
    assert.equal(similarity('Pokémon Center', 'pokemon center'), 1);
  });

  it('scores a near miss highly', () => {
    assert.ok(similarity('Charizrd', 'Charizard') > 0.85);
  });

  it('rescues a name with OCR junk appended', () => {
    assert.ok(similarity('charizard ex 330 hp', 'Charizard ex') >= 0.9);
  });

  it('scores unrelated names low', () => {
    assert.ok(similarity('Charizard', 'Venusaur') < 0.35);
  });
});

describe('normalizeNumber', () => {
  it('strips leading zeros on numeric collector numbers', () => {
    assert.equal(normalizeNumber('004'), '4');
  });

  it('leaves alphanumeric numbering intact but uppercased', () => {
    assert.equal(normalizeNumber('tg05'), 'TG05');
  });
});

describe('scoreCard', () => {
  it('scores an exact scan near 1', () => {
    const parsed = parseCardText('Charizard\n4/102');
    const { score, reasons } = scoreCard(parsed, charizardBase);
    assert.ok(score > 0.95, `expected >0.95, got ${score}`);
    assert.ok(reasons.some((r) => r.includes('collector number')));
  });

  it('stays on a 0..1 scale when the number was unreadable', () => {
    // Name-only scan: must not be capped at the name weight (0.55).
    const parsed = parseCardText('Charizard');
    const { score } = scoreCard(parsed, charizardBase);
    assert.ok(score > 0.95, `expected >0.95, got ${score}`);
  });

  it('separates two printings of the same name by collector number', () => {
    const parsed = parseCardText('Charizard ex\n054/165');
    const svi = scoreCard(parsed, charizardSVI).score;
    const base = scoreCard(parsed, charizardBase).score;
    assert.ok(svi > base, `expected SVI (${svi}) > Base (${base})`);
  });

  it('uses the set code to break a tie between identical reprints', () => {
    // Same name, same number, same set size — the code is the only signal
    // that separates them, so it has to be able to move the score.
    const reprintOBF: ScoreTarget = {
      name: 'Charizard ex',
      number: '54',
      set: { printedTotal: 165, total: 198, ptcgoCode: 'OBF' },
    };
    const reprintPAF: ScoreTarget = { ...reprintOBF, set: { ...reprintOBF.set, ptcgoCode: 'PAF' } };

    const parsed = parseCardText('Charizard ex\n054/165\nOBF EN');
    assert.ok(scoreCard(parsed, reprintOBF).score > scoreCard(parsed, reprintPAF).score);
  });

  it('ignores the set code for older sets that never printed one', () => {
    const parsed = parseCardText('Charizard\n4/102\nOBF EN');
    const noCode: ScoreTarget = { ...charizardBase, set: { ...charizardBase.set, ptcgoCode: null } };
    assert.ok(scoreCard(parsed, noCode).score > 0.95);
  });

  it('returns zero when there is no signal at all', () => {
    assert.equal(scoreCard(parseCardText('####'), charizardBase).score, 0);
  });
});

describe('rankMatches', () => {
  const catalog = [charizardBase, charizardSVI, venusaurBase];

  it('ranks the right printing first', () => {
    const parsed = parseCardText('Charizard\n4/102');
    const ranked = rankMatches(parsed, catalog, (item) => item);
    assert.equal(ranked[0]?.item.name, 'Charizard');
    assert.equal(ranked[0]?.item.number, '4');
  });

  it('filters out cards below the confidence floor', () => {
    const parsed = parseCardText('Charizard\n4/102');
    const ranked = rankMatches(parsed, catalog, (item) => item, { minScore: 0.5 });
    assert.ok(!ranked.some((r) => r.item.name === 'Venusaur'));
  });

  it('respects the limit', () => {
    const parsed = parseCardText('Charizard');
    const ranked = rankMatches(parsed, catalog, (item) => item, { limit: 1, minScore: 0 });
    assert.equal(ranked.length, 1);
  });
});
