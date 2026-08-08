import type { CardSet, PriceVariant } from '@pokedex/shared';

/**
 * A representative slice of the real catalog, spanning eras so that variant
 * handling (1st Edition holos through modern reverse holos) is exercised
 * offline. Set ids, names, totals and codes match the real ones, so a database
 * seeded here has the same shape as one synced from a live provider.
 */
export const FIXTURE_SETS: CardSet[] = [
  {
    id: 'base1',
    name: 'Base',
    series: 'Base',
    printedTotal: 102,
    total: 102,
    releaseDate: '1999/01/09',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'BS',
  },
  {
    id: 'neo1',
    name: 'Neo Genesis',
    series: 'Neo',
    printedTotal: 111,
    total: 111,
    releaseDate: '2000/12/16',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'N1',
  },
  {
    id: 'xy12',
    name: 'Evolutions',
    series: 'XY',
    printedTotal: 108,
    total: 113,
    releaseDate: '2016/11/02',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'EVO',
  },
  {
    id: 'swsh4',
    name: 'Vivid Voltage',
    series: 'Sword & Shield',
    printedTotal: 185,
    total: 203,
    releaseDate: '2020/11/13',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'VIV',
  },
  {
    id: 'swsh12pt5',
    name: 'Crown Zenith',
    series: 'Sword & Shield',
    printedTotal: 159,
    total: 160,
    releaseDate: '2023/01/20',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'CRZ',
  },
  {
    id: 'sv1',
    name: 'Scarlet & Violet',
    series: 'Scarlet & Violet',
    printedTotal: 198,
    total: 258,
    releaseDate: '2023/03/31',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'SVI',
  },
  {
    id: 'sv3pt5',
    name: '151',
    series: 'Scarlet & Violet',
    printedTotal: 165,
    total: 207,
    releaseDate: '2023/09/22',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'MEW',
  },
  {
    id: 'sv4',
    name: 'Paradox Rift',
    series: 'Scarlet & Violet',
    printedTotal: 182,
    total: 266,
    releaseDate: '2023/11/03',
    symbolImage: null,
    logoImage: null,
    ptcgoCode: 'PAR',
  },
];

export interface FixtureCardDef {
  name: string;
  number: string;
  rarity: string;
  variants: PriceVariant[];
  /** Overrides the rarity-derived base price, in cents. */
  basePriceCents?: number;
}

/** Chase cards, given explicit prices so the demo data looks believable. */
export const FIXTURE_HEADLINERS: Record<string, FixtureCardDef[]> = {
  base1: [
    {
      name: 'Charizard',
      number: '4',
      rarity: 'Rare Holo',
      variants: ['holofoil', '1stEditionHolofoil'],
      basePriceCents: 42_000,
    },
    {
      name: 'Blastoise',
      number: '2',
      rarity: 'Rare Holo',
      variants: ['holofoil', '1stEditionHolofoil'],
      basePriceCents: 18_500,
    },
    {
      name: 'Venusaur',
      number: '15',
      rarity: 'Rare Holo',
      variants: ['holofoil', '1stEditionHolofoil'],
      basePriceCents: 14_000,
    },
    {
      name: 'Pikachu',
      number: '58',
      rarity: 'Common',
      variants: ['normal', '1stEditionNormal'],
      basePriceCents: 2_400,
    },
  ],
  neo1: [
    {
      name: 'Lugia',
      number: '9',
      rarity: 'Rare Holo',
      variants: ['holofoil', '1stEditionHolofoil'],
      basePriceCents: 68_000,
    },
    {
      name: 'Typhlosion',
      number: '17',
      rarity: 'Rare Holo',
      variants: ['holofoil', '1stEditionHolofoil'],
      basePriceCents: 6_500,
    },
  ],
  xy12: [
    {
      name: 'Charizard',
      number: '11',
      rarity: 'Rare Holo',
      variants: ['holofoil', 'reverseHolofoil'],
      basePriceCents: 9_800,
    },
    {
      name: 'Mewtwo EX',
      number: '52',
      rarity: 'Rare Holo EX',
      variants: ['holofoil'],
      basePriceCents: 4_200,
    },
  ],
  swsh4: [
    {
      name: 'Pikachu VMAX',
      number: '188',
      rarity: 'Rare Rainbow',
      variants: ['holofoil'],
      basePriceCents: 12_500,
    },
    {
      name: 'Charizard',
      number: '25',
      rarity: 'Rare',
      variants: ['normal', 'reverseHolofoil'],
      basePriceCents: 900,
    },
  ],
  swsh12pt5: [
    {
      name: 'Giratina VSTAR',
      number: 'GG69',
      rarity: 'Rare Secret',
      variants: ['holofoil'],
      basePriceCents: 22_000,
    },
    {
      name: 'Mewtwo VSTAR',
      number: 'GG44',
      rarity: 'Rare Secret',
      variants: ['holofoil'],
      basePriceCents: 3_100,
    },
  ],
  sv1: [
    {
      name: 'Miriam',
      number: '251',
      rarity: 'Special Illustration Rare',
      variants: ['holofoil'],
      basePriceCents: 5_600,
    },
    {
      name: 'Koraidon ex',
      number: '254',
      rarity: 'Special Illustration Rare',
      variants: ['holofoil'],
      basePriceCents: 4_400,
    },
  ],
  sv3pt5: [
    {
      name: 'Charizard ex',
      number: '199',
      rarity: 'Special Illustration Rare',
      variants: ['holofoil'],
      basePriceCents: 31_000,
    },
    {
      name: 'Alakazam ex',
      number: '203',
      rarity: 'Hyper Rare',
      variants: ['holofoil'],
      basePriceCents: 8_900,
    },
    {
      name: 'Charizard ex',
      number: '6',
      rarity: 'Double Rare',
      variants: ['holofoil'],
      basePriceCents: 2_800,
    },
    {
      name: 'Mew ex',
      number: '151',
      rarity: 'Double Rare',
      variants: ['holofoil'],
      basePriceCents: 1_900,
    },
  ],
  sv4: [
    {
      name: 'Roaring Moon ex',
      number: '251',
      rarity: 'Special Illustration Rare',
      variants: ['holofoil'],
      basePriceCents: 7_400,
    },
    {
      name: 'Iron Valiant ex',
      number: '89',
      rarity: 'Double Rare',
      variants: ['holofoil'],
      basePriceCents: 1_100,
    },
  ],
};

/** Filler pool, so search and movers have realistic depth behind the chases. */
export const FILLER_NAMES = [
  'Bulbasaur', 'Ivysaur', 'Charmander', 'Charmeleon', 'Squirtle', 'Wartortle',
  'Caterpie', 'Weedle', 'Pidgey', 'Pidgeotto', 'Rattata', 'Spearow', 'Ekans',
  'Sandshrew', 'Nidoran', 'Clefairy', 'Vulpix', 'Jigglypuff', 'Zubat', 'Oddish',
  'Paras', 'Venonat', 'Diglett', 'Meowth', 'Psyduck', 'Mankey', 'Growlithe',
  'Poliwag', 'Abra', 'Machop', 'Bellsprout', 'Tentacool', 'Geodude', 'Ponyta',
  'Slowpoke', 'Magnemite', 'Farfetch’d', 'Doduo', 'Seel', 'Grimer',
  'Shellder', 'Gastly', 'Onix', 'Drowzee', 'Krabby', 'Voltorb', 'Exeggcute',
  'Cubone', 'Hitmonlee', 'Lickitung', 'Koffing', 'Rhyhorn', 'Chansey',
  'Tangela', 'Kangaskhan', 'Horsea', 'Goldeen', 'Staryu', 'Mr. Mime',
  'Scyther', 'Jynx', 'Electabuzz', 'Magmar', 'Pinsir', 'Tauros', 'Magikarp',
  'Lapras', 'Ditto', 'Eevee', 'Porygon', 'Omanyte', 'Kabuto', 'Aerodactyl',
  'Snorlax', 'Dratini', 'Chikorita', 'Cyndaquil', 'Totodile', 'Sentret',
  'Hoothoot', 'Ledyba', 'Spinarak', 'Chinchou', 'Pichu', 'Cleffa', 'Togepi',
  'Mareep', 'Sudowoodo', 'Aipom', 'Sunkern', 'Yanma', 'Wooper', 'Murkrow',
  'Misdreavus', 'Girafarig', 'Pineco', 'Dunsparce', 'Gligar', 'Snubbull',
  'Qwilfish', 'Shuckle', 'Sneasel', 'Teddiursa', 'Swinub', 'Corsola',
  'Remoraid', 'Delibird', 'Mantine', 'Skarmory', 'Houndour', 'Phanpy',
  'Stantler', 'Smeargle', 'Tyrogue', 'Elekid', 'Magby', 'Miltank',
] as const;

export const FILLER_RARITIES: { rarity: string; variants: PriceVariant[]; weight: number }[] = [
  { rarity: 'Common', variants: ['normal', 'reverseHolofoil'], weight: 50 },
  { rarity: 'Uncommon', variants: ['normal', 'reverseHolofoil'], weight: 30 },
  { rarity: 'Rare', variants: ['normal', 'reverseHolofoil'], weight: 14 },
  { rarity: 'Rare Holo', variants: ['holofoil', 'reverseHolofoil'], weight: 6 },
];

/** Rarity -> base price band in cents, before per-card jitter. */
export const RARITY_BASE_CENTS: Record<string, [number, number]> = {
  Common: [8, 60],
  Uncommon: [15, 120],
  Rare: [40, 350],
  'Rare Holo': [180, 1_800],
  'Rare Holo EX': [800, 6_000],
  'Rare Rainbow': [2_000, 14_000],
  'Rare Secret': [1_500, 20_000],
  'Double Rare': [400, 3_500],
  'Hyper Rare': [1_800, 12_000],
  'Special Illustration Rare': [2_500, 30_000],
};

export const DEFAULT_RARITY_BAND: [number, number] = [20, 200];

/** Cards generated per fixture set, in addition to that set's headliners. */
export const FILLER_PER_SET = 28;
