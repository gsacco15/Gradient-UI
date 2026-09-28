// Field-note colour names: every colour is a place and a moment in nature.
import { hexToOklab, labDistance, type Lab } from '../lib/color';

export const COLOR_NAMES: [string, string][] = [
  // sky
  ['#0B1026', 'POLAR NIGHT'], ['#141B3A', 'DEEP ZENITH'], ['#1E2A5A', 'NIGHT CANOPY'], ['#2C3E7A', 'ASTRAL BLUE'],
  ['#3F5A8C', 'BLUE HOUR'], ['#5B7DB8', 'HIGH ALTITUDE'], ['#7FA6D9', 'CLEAR NOON'], ['#A9C8EC', 'THIN AIR'],
  ['#CFE2F5', 'CIRRUS VEIL'], ['#E9F1F8', 'MORNING HAZE'], ['#F4F1EA', 'OVERCAST WHITE'], ['#FBF6EE', 'FIRST LIGHT'],
  ['#FFE3C4', 'APRICOT DAWN'], ['#F9C79A', 'SUNRISE PEACH'], ['#F6B47A', 'GOLDEN HOUR'], ['#F29A5E', 'EMBER SKY'],
  ['#E8744A', 'SOLAR FLARE'], ['#D9534F', 'RED SKY AT NIGHT'], ['#F4B6C2', 'ALPENGLOW'], ['#E89AB8', 'PINK TWILIGHT'],
  ['#C77DB0', 'AFTERGLOW'], ['#B98BC9', 'DUSK LILAC'], ['#8E6FB5', 'CIVIL TWILIGHT'], ['#5E4B8B', 'NAUTICAL DUSK'],
  // weather
  ['#6E7781', 'SQUALL LINE'], ['#8A939C', 'RAIN CURTAIN'], ['#A7AEB5', 'SEA FOG'], ['#C9CED3', 'MIST BANK'],
  ['#4A4F5C', 'ANVIL CLOUD'], ['#343844', 'STORM CELL'], ['#B7A6F2', 'LIGHTNING VIOLET'], ['#DDE7EE', 'FROST BREATH'],
  ['#EDE6D6', 'DRY SEASON'], ['#9FB3C8', 'DRIZZLE'],
  // aurora + space
  ['#3DF5A7', 'SOLAR WIND'], ['#1FD1A0', 'AURORA GREEN'], ['#7CF0D0', 'ARCTIC VEIL'], ['#C24DF0', 'MAGNETOSPHERE'],
  ['#8A3FFC', 'ULTRAVIOLET'], ['#E13CA8', 'CORONA PINK'], ['#2B1B4E', 'NEBULA DUSK'], ['#4B2A7B', 'ORION DUST'],
  ['#0A0A12', 'EVENT HORIZON'], ['#1B1430', 'DARK MATTER'], ['#F2E7FF', 'STARLIGHT'], ['#6C4CE0', 'COSMIC RAY'],
  // ocean
  ['#0E2A47', 'MIDNIGHT ZONE'], ['#123B5E', 'ABYSS'], ['#1D5C7A', 'OPEN WATER'], ['#2A7F9E', 'DEEP CURRENT'],
  ['#35A7B8', 'REEF'], ['#5FD0CF', 'LAGOON'], ['#9EE6DE', 'SHALLOWS'], ['#CFF3EC', 'SEA GLASS'],
  ['#1F6F66', 'KELP FOREST'], ['#56F0FF', 'PLANKTON GLOW'], ['#E6F7F4', 'SEA FOAM'], ['#6FA3B8', 'GLACIER HOUR'],
  // desert
  ['#E8925A', 'DUNE EMBER'], ['#C8643B', 'RED MESA'], ['#A64B2A', 'CANYON WALL'], ['#D9B48A', 'SANDSTONE'],
  ['#EFD9B4', 'SALT FLAT'], ['#F5E6C8', 'BLEACHED BONE'], ['#E3C27A', 'HEAT SHIMMER'], ['#B88A5A', 'DUST DEVIL'],
  ['#8C5A3C', 'ADOBE'], ['#F1C9A5', 'MIRAGE'],
  // forest
  ['#1F3A2B', 'OLD GROWTH'], ['#2F6B4F', 'WET CANOPY'], ['#4E8C5A', 'FERN LIGHT'], ['#7BAE6E', 'MOSS FLOOR'],
  ['#A9CB8C', 'NEW LEAF'], ['#D6E8BF', 'SPRING SHOOT'], ['#9FD9B3', 'MEADOW MIST'], ['#56694A', 'LICHEN'],
  ['#3B4A34', 'FOREST SHADE'], ['#C7D36F', 'POLLEN'], ['#6B5A3E', 'BARK'], ['#8FA88A', 'SAGE HILL'],
  // volcanic
  ['#FF5A1F', 'MAGMA VEIN'], ['#E03A1E', 'LAVA FLOW'], ['#2A2626', 'BASALT'], ['#4A4442', 'ASH PLUME'],
  ['#F2D53C', 'SULPHUR'], ['#FF8A3D', 'CALDERA'], ['#7A2E1E', 'SCORIA'], ['#191717', 'OBSIDIAN'],
  // bloom
  ['#B69BD9', 'LAVENDER ROW'], ['#E04E4E', 'POPPY HILL'], ['#F7C6D9', 'CHERRY RAIN'], ['#FFD84D', 'SUNFLOWER FIELD'],
  ['#F7A8B8', 'PEONY'], ['#FFB3A1', 'CORAL BLOOM'], ['#FFF1A8', 'BUTTERCUP'], ['#C2E0F2', 'FORGET-ME-NOT'],
  ['#E9D5F5', 'WISTERIA'], ['#FF7AA8', 'FUCHSIA GROVE'], ['#FCE7EF', 'PETAL WHITE'], ['#9C3D6B', 'PLUM ORCHARD'],
  // ice
  ['#DCEEFA', 'HOARFROST'], ['#A8D8F0', 'CREVASSE'], ['#7CC1E4', 'GLACIER MELT'], ['#EAF6FF', 'FRESH POWDER'],
  ['#4F8FBF', 'ICE SHELF'], ['#2D5F8A', 'POLAR SEA'], ['#BFE3E8', 'SNOWLIGHT'], ['#F7FBFF', 'WHITEOUT'],
  // neutrals
  ['#FFFFFF', 'CLOUD TOP'], ['#000000', 'NEW MOON'], ['#D8D4CC', 'LIMESTONE'], ['#9E978C', 'RIVER STONE'],
  ['#5C5750', 'SLATE CLIFF'], ['#2E3434', 'WET GRANITE'],
];

const TABLE: { hex: string; name: string; lab: Lab }[] = COLOR_NAMES.map(([hex, name]) => ({
  hex,
  name,
  lab: hexToOklab(hex),
}));

/** Nearest field-note name for any colour. */
export function nameForColor(hex: string): string {
  const lab = hexToOklab(hex);
  let best = TABLE[0], bestD = Infinity;
  for (const e of TABLE) {
    const d = labDistance(lab, e.lab);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best.name;
}

export interface Place {
  place: string;
  coords: string;
  mood: 'cold' | 'warm' | 'lush' | 'neon' | 'dark' | 'soft';
}

export const PLACES: Place[] = [
  { place: 'ICELAND FJORD', coords: '64.14° N · 21.94° W', mood: 'cold' },
  { place: 'RODEN CRATER', coords: '35.43° N · 111.26° W', mood: 'warm' },
  { place: 'PATAGONIA', coords: '50.94° S · 73.40° W', mood: 'cold' },
  { place: 'SAHARA', coords: '23.41° N · 25.66° E', mood: 'warm' },
  { place: 'LENÇÓIS MARANHENSES', coords: '2.49° S · 43.12° W', mood: 'soft' },
  { place: 'ATACAMA', coords: '24.50° S · 69.25° W', mood: 'warm' },
  { place: 'AMAZON', coords: '3.47° S · 62.37° W', mood: 'lush' },
  { place: 'BORNEO', coords: '0.96° N · 114.55° E', mood: 'lush' },
  { place: 'TROMSØ', coords: '69.65° N · 18.96° E', mood: 'neon' },
  { place: 'YUKON', coords: '64.28° N · 135.00° W', mood: 'neon' },
  { place: 'MARIANA TRENCH', coords: '11.35° N · 142.20° E', mood: 'dark' },
  { place: 'MAUNA KEA', coords: '19.82° N · 155.47° W', mood: 'dark' },
  { place: 'PROVENCE', coords: '43.95° N · 5.78° E', mood: 'soft' },
  { place: 'CAPPADOCIA', coords: '38.64° N · 34.83° E', mood: 'soft' },
  { place: 'MALDIVES', coords: '3.20° N · 73.22° E', mood: 'lush' },
  { place: 'NAMIB', coords: '24.73° S · 15.34° E', mood: 'warm' },
  { place: 'SVALBARD', coords: '78.22° N · 15.65° E', mood: 'cold' },
  { place: 'BIG SUR', coords: '36.27° N · 121.81° W', mood: 'soft' },
  { place: 'ETNA', coords: '37.75° N · 14.99° E', mood: 'warm' },
  { place: 'ULURU', coords: '25.34° S · 131.03° E', mood: 'warm' },
  { place: 'LOFOTEN', coords: '68.15° N · 13.61° E', mood: 'cold' },
  { place: 'YAKUSHIMA FOREST', coords: '30.36° N · 130.53° E', mood: 'lush' },
  { place: 'SALAR DE UYUNI', coords: '20.13° S · 67.49° W', mood: 'soft' },
  { place: 'GREAT BARRIER REEF', coords: '18.28° S · 147.70° E', mood: 'lush' },
  { place: 'ANTARCTIC SHELF', coords: '77.85° S · 166.67° E', mood: 'cold' },
  { place: 'DEATH VALLEY', coords: '36.50° N · 117.08° W', mood: 'warm' },
];

export function randomTime(rand = Math.random): string {
  const h = Math.floor(rand() * 24), m = Math.floor(rand() * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
