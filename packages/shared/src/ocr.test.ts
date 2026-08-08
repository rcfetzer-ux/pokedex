import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nameCandidates, normalizeLines, parseCardText } from './ocr.js';

describe('parseCardText', () => {
  it('pulls name, number and set total off a modern card', () => {
    const parsed = parseCardText(
      [
        'Charizard ex',
        'Stage 2',
        '330 HP',
        'Burning Darkness 180+',
        'Weakness x2  Resistance  Retreat 2',
        'Illus. 5ban Graphics',
        '004/165  SVI EN',
      ].join('\n'),
    );

    assert.equal(parsed.name, 'Charizard ex');
    assert.equal(parsed.number, '4');
    assert.equal(parsed.printedTotal, 165);
    assert.equal(parsed.setCode, 'SVI');
    assert.equal(parsed.firstEdition, false);
  });

  it('strips leading zeros so the number matches the catalog form', () => {
    assert.equal(parseCardText('007/165').number, '7');
  });

  it('reads trainer-gallery style alphanumeric numbering', () => {
    const parsed = parseCardText('Pikachu V\nTG05/TG30');
    assert.equal(parsed.number, 'TG05');
  });

  it('reads standalone promo numbering', () => {
    assert.equal(parseCardText('Zacian V\nSWSH284').number, 'SWSH284');
  });

  it('detects a 1st Edition stamp', () => {
    assert.equal(parseCardText('Blastoise\n1st Edition\n2/102').firstEdition, true);
  });

  it('tolerates OCR mangling the slash', () => {
    assert.equal(parseCardText('025 | 165').printedTotal, 165);
  });

  it('returns nulls rather than guessing on unreadable text', () => {
    const parsed = parseCardText('#$%^&*\n   \n||||');
    assert.equal(parsed.name, null);
    assert.equal(parsed.number, null);
    assert.equal(parsed.printedTotal, null);
  });
});

describe('nameCandidates', () => {
  it('rejects rules text, stage lines and legal footers', () => {
    const lines = normalizeLines(
      [
        'Stage 2',
        'Ability: Infernal Reign',
        'Search your deck for up to 3 Basic Energy',
        'Weakness x2',
        'Illus. 5ban Graphics',
        '© 2023 Pokemon / Nintendo',
        'Charizard ex',
      ].join('\n'),
    );
    const candidates = nameCandidates(lines);
    assert.deepEqual(candidates, ['Charizard ex']);
  });

  it('keeps the V/VMAX/ex suffix that disambiguates reprints', () => {
    assert.deepEqual(nameCandidates(['Mew VMAX']), ['Mew VMAX']);
  });

  it('drops a trailing HP reading glued onto the name', () => {
    assert.deepEqual(nameCandidates(['Pikachu HP 60']), ['Pikachu']);
  });

  it('deduplicates repeated readings', () => {
    assert.deepEqual(nameCandidates(['Snorlax', 'snorlax']), ['Snorlax']);
  });
});
