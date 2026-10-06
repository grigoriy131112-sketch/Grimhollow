// Each continent's chart is a genuine public-domain antique engraving, the same
// way Мордрат lies on the Boero survey. The images live in public/art/maps/ and
// every source is credited in public/art/CREDITS.txt. A continent without its
// own sheet falls back to the Boero map so the atlas never renders blank.

export const CONTINENT_ART = {
  'Мордрат': {
    src: '/art/maps/isle-antique.jpg',
    credit: 'van der Schley, «Остров Боэро» (ок. 1753) · общественное достояние.',
  },
  'Морозная Колыбель': {
    src: '/art/maps/continent-frozen.jpg',
    credit: 'Homann Heirs, «Insulae Islandiae» (1761) · общественное достояние.',
  },
  'Кор-Ашан': {
    src: '/art/maps/continent-glass.jpg',
    credit: 'J. Pinkerton, карта Северной Африки (1818) · общественное достояние.',
  },
  'Вольные Гавани': {
    src: '/art/maps/continent-havens.jpg',
    credit: 'Zannoni, карта Вест-Индии (1762) · общественное достояние.',
  },
  'Зелёный Предел': {
    src: '/art/maps/continent-forest.jpg',
    credit: 'W. Blaeu, «Guiana, Venezuela and El Dorado» (1635) · общественное достояние.',
  },
};

export const DEFAULT_CONTINENT_ART = CONTINENT_ART['Мордрат'];

export function continentArt(name) {
  return CONTINENT_ART[name] || DEFAULT_CONTINENT_ART;
}
