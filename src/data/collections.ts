// Curated presets. Each is a field note: a place, a moment and its colours.
import { makeGradient, type GradientSeed } from '../lib/gradient';
import type { Gradient, GradientType } from '../types';
import { PLACES } from './names';

export interface Collection {
  id: string;
  title: string;
  blurb: string;
  gradients: Gradient[];
}

type Opts = Omit<GradientSeed, 'name' | 'place' | 'time' | 'colors' | 'type' | 'collection'>;
type Row = [name: string, place: string, time: string, type: GradientType, colors: string[], opts?: Opts];

const coordsFor = (place: string) => PLACES.find((p) => p.place === place)?.coords;

const soft = { weather: { fog: 0.35, haze: 0.22 } };
const grainy = { weather: { haze: 0.4 } };
const frame = (count = 3, shape: 'square' | 'circle' | 'arch' = 'square', softness = 0.85) => ({
  composition: { count, shape, softness },
  weather: { fog: 0.4, haze: 0.35 },
});

const DATA: Record<string, { title: string; blurb: string; rows: Row[] }> = {
  sky: {
    title: 'SKY HOURS',
    blurb: 'Dawn through midnight, one hour at a time.',
    rows: [
      ['FIRST LIGHT', 'BIG SUR', '05:48', 'linear', ['#3F5A8C', '#B98BC9', '#F4B6C2', '#FFE3C4'], { angle: 0 }],
      ['BLUE HOUR', 'LOFOTEN', '21:40', 'linear', ['#141B3A', '#2C3E7A', '#5B7DB8', '#A9C8EC'], { angle: 0, ...grainy }],
      ['GOLDEN HOUR', 'PROVENCE', '19:52', 'radial', ['#FFE3C4', '#F6B47A', '#E8744A', '#8E6FB5'], { center: { x: 0.5, y: 1 } }],
      ['SOLAR NOON', 'SALAR DE UYUNI', '12:04', 'linear', ['#5B7DB8', '#7FA6D9', '#CFE2F5', '#F4F1EA'], { angle: 180 }],
      ['ALPENGLOW', 'PATAGONIA', '20:31', 'mesh', ['#F4B6C2', '#E89AB8', '#8E6FB5', '#FFE3C4', '#3F5A8C'], soft],
      ['CIVIL TWILIGHT', 'CAPPADOCIA', '06:12', 'frame', ['#5E4B8B', '#C77DB0', '#F9C79A'], frame(3)],
      ['AFTERGLOW', 'DEATH VALLEY', '20:05', 'linear', ['#2C3E7A', '#8E6FB5', '#E89AB8', '#F29A5E', '#F9C79A'], { angle: 0 }],
      ['SUNRISE PEACH', 'MALDIVES', '06:02', 'mesh', ['#FFE3C4', '#F9C79A', '#CFE2F5', '#F4B6C2'], soft],
      ['DEEP ZENITH', 'MAUNA KEA', '23:58', 'radial', ['#2C3E7A', '#141B3A', '#0B1026'], { center: { x: 0.5, y: 1.1 }, weather: { haze: 0.45 } }],
    ],
  },
  weather: {
    title: 'WEATHER',
    blurb: 'Fog banks, squall lines and the light after rain.',
    rows: [
      ['SEA FOG', 'BIG SUR', '07:15', 'mesh', ['#E9F1F8', '#C9CED3', '#A7AEB5', '#F4F1EA'], { weather: { fog: 0.6, haze: 0.3 } }],
      ['SQUALL LINE', 'LOFOTEN', '16:22', 'linear', ['#343844', '#6E7781', '#A7AEB5', '#DDE7EE'], { angle: 160, weather: { haze: 0.5, clouds: 0.4 } }],
      ['ANVIL CLOUD', 'DEATH VALLEY', '17:48', 'mesh', ['#4A4F5C', '#8A939C', '#F6B47A', '#343844'], { weather: { clouds: 0.5, haze: 0.3 } }],
      ['LIGHTNING VIOLET', 'ATACAMA', '02:13', 'radial', ['#F2E7FF', '#B7A6F2', '#4B2A7B', '#141B3A'], { center: { x: 0.62, y: 0.3 }, weather: { haze: 0.35 } }],
      ['AFTER RAIN', 'AMAZON', '15:40', 'mesh', ['#9FB3C8', '#9FD9B3', '#E9F1F8', '#4E8C5A'], soft],
      ['DRIZZLE', 'ICELAND FJORD', '10:10', 'linear', ['#9FB3C8', '#C9CED3', '#EDE6D6'], { angle: 180, weather: { frost: 0.35, haze: 0.2 } }],
      ['STORM CELL', 'YUKON', '19:01', 'frame', ['#343844', '#6E7781', '#B7A6F2'], frame(4, 'circle')],
      ['MIST BANK', 'YAKUSHIMA FOREST', '06:40', 'linear', ['#C9CED3', '#DDE7EE', '#9FD9B3'], { angle: 0, weather: { fog: 0.5, clouds: 0.3, haze: 0.2 } }],
      ['RAINBOW EDGE', 'MAUNA KEA', '16:55', 'radial', ['#E9F1F8', '#FFF1A8', '#9FD9B3', '#A9C8EC', '#B69BD9', '#E9F1F8'], { center: { x: 0.5, y: 1.2 }, weather: { fog: 0.4, haze: 0.2 } }],
    ],
  },
  aurora: {
    title: 'AURORA',
    blurb: 'Solar wind, painted across polar skies.',
    rows: [
      ['SOLAR WIND', 'TROMSØ', '23:14', 'mesh', ['#3DF5A7', '#0B1026', '#C24DF0', '#141B3A', '#1FD1A0'], { background: '#0B1026', weather: { fog: 0.3, haze: 0.35 }, motion: { mode: 'drift', speed: 0.5, duration: 10 } }],
      ['ARCTIC VEIL', 'SVALBARD', '01:02', 'linear', ['#0B1026', '#1FD1A0', '#7CF0D0', '#141B3A'], { angle: 200, weather: { clouds: 0.5, haze: 0.3 } }],
      ['MAGNETOSPHERE', 'YUKON', '00:47', 'conic', ['#C24DF0', '#3DF5A7', '#0B1026', '#C24DF0'], { weather: { fog: 0.55, haze: 0.3 } }],
      ['CORONA', 'TROMSØ', '22:08', 'radial', ['#E13CA8', '#8A3FFC', '#1FD1A0', '#0B1026'], { weather: { haze: 0.4 } }],
      ['GREEN RIBBON', 'LOFOTEN', '02:30', 'frame', ['#0B1026', '#1FD1A0', '#3DF5A7'], frame(3, 'arch')],
      ['POLAR CURTAIN', 'ANTARCTIC SHELF', '03:33', 'mesh', ['#7CF0D0', '#8A3FFC', '#0B1026', '#3DF5A7'], { background: '#0B1026', weather: { fog: 0.4, clouds: 0.35, haze: 0.3 } }],
      ['ULTRAVIOLET', 'YUKON', '01:19', 'linear', ['#141B3A', '#8A3FFC', '#E13CA8', '#3DF5A7'], { angle: 10, weather: { haze: 0.35 } }],
      ['SUBSTORM', 'SVALBARD', '04:04', 'mesh', ['#3DF5A7', '#C24DF0', '#56F0FF', '#0A0A12'], { background: '#0A0A12', composition: { symmetry: 'mirror' }, weather: { fog: 0.3, haze: 0.4 } }],
    ],
  },
  space: {
    title: 'DEEP SPACE',
    blurb: 'Nebulae, dust lanes and the dark between stars.',
    rows: [
      ['ORION DUST', 'MAUNA KEA', '03:21', 'mesh', ['#4B2A7B', '#E13CA8', '#0A0A12', '#6C4CE0', '#F29A5E'], { background: '#0A0A12', weather: { fog: 0.35, haze: 0.45 } }],
      ['EVENT HORIZON', 'ATACAMA', '00:00', 'radial', ['#0A0A12', '#0A0A12', '#FF8A3D', '#2B1B4E', '#0A0A12'], { weather: { fog: 0.3, haze: 0.4 } }],
      ['NEBULA DUSK', 'MAUNA KEA', '02:48', 'linear', ['#0A0A12', '#2B1B4E', '#6C4CE0', '#E89AB8'], { angle: 20, weather: { clouds: 0.6, haze: 0.4 } }],
      ['DARK MATTER', 'ATACAMA', '01:11', 'frame', ['#0A0A12', '#1B1430', '#4B2A7B'], frame(4)],
      ['STARLIGHT', 'NAMIB', '04:40', 'mesh', ['#F2E7FF', '#1B1430', '#6C4CE0', '#0A0A12'], { background: '#0A0A12', weather: { haze: 0.6, fog: 0.2 } }],
      ['PULSAR', 'MAUNA KEA', '03:03', 'conic', ['#6C4CE0', '#0A0A12', '#56F0FF', '#0A0A12', '#6C4CE0'], { composition: { symmetry: 'kaleido', slices: 8 }, weather: { fog: 0.4, haze: 0.4 } }],
      ['COSMIC RAY', 'ATACAMA', '02:02', 'linear', ['#0A0A12', '#6C4CE0', '#C24DF0', '#F2E7FF'], { angle: 135, weather: { frost: 0.4, haze: 0.2 } }],
      ['QUADRANT NEBULA', 'MAUNA KEA', '05:05', 'frame', ['#F4F1EA', '#6C4CE0', '#1B1430'], { composition: { symmetry: 'quadrant', count: 2, softness: 0.95 }, weather: { fog: 0.5, haze: 0.5 } }],
    ],
  },
  ocean: {
    title: 'OCEAN',
    blurb: 'Reef light, open water and the midnight zone.',
    rows: [
      ['LAGOON', 'MALDIVES', '11:30', 'linear', ['#9EE6DE', '#5FD0CF', '#35A7B8', '#1D5C7A'], { angle: 180 }],
      ['MIDNIGHT ZONE', 'MARIANA TRENCH', '—', 'linear', ['#2A7F9E', '#123B5E', '#0E2A47', '#0A0A12'], { angle: 180, weather: { haze: 0.4 } }],
      ['PLANKTON GLOW', 'MALDIVES', '23:50', 'mesh', ['#56F0FF', '#0E2A47', '#1FD1A0', '#0A0A12'], { background: '#0A0A12', weather: { fog: 0.3, haze: 0.4 }, motion: { mode: 'pulse', speed: 0.5, duration: 6 } }],
      ['KELP FOREST', 'BIG SUR', '14:12', 'linear', ['#9EE6DE', '#1F6F66', '#123B5E'], { angle: 180, weather: { heat: 0.3, haze: 0.25 } }],
      ['SEA GLASS', 'LOFOTEN', '13:05', 'mesh', ['#CFF3EC', '#9EE6DE', '#E6F7F4', '#A8D8F0'], soft],
      ['REEF', 'GREAT BARRIER REEF', '10:44', 'mesh', ['#5FD0CF', '#FFB3A1', '#35A7B8', '#F7A8B8', '#1D5C7A'], soft],
      ['DEEP CURRENT', 'SVALBARD', '08:21', 'frame', ['#E6F7F4', '#2A7F9E', '#0E2A47'], frame(3, 'circle')],
      ['SHALLOWS', 'MALDIVES', '09:09', 'radial', ['#E6F7F4', '#9EE6DE', '#5FD0CF'], { center: { x: 0.3, y: 0.3 }, weather: { heat: 0.25, haze: 0.2 } }],
      ['TIDE LINE', 'BIG SUR', '17:17', 'linear', ['#1D5C7A', '#5FD0CF', '#E6F7F4', '#EFD9B4'], { angle: 180 }],
    ],
  },
  desert: {
    title: 'DESERT',
    blurb: 'Dune ember, salt flats and heat on the horizon.',
    rows: [
      ['DUNE EMBER', 'SAHARA', '18:44', 'linear', ['#F5E6C8', '#E8925A', '#A64B2A'], { angle: 180, ...grainy }],
      ['RED MESA', 'ULURU', '19:02', 'frame', ['#EFD9B4', '#C8643B', '#8C5A3C'], frame(3)],
      ['SALT FLAT', 'SALAR DE UYUNI', '13:30', 'linear', ['#A9C8EC', '#E9F1F8', '#F5E6C8', '#EFD9B4'], { angle: 180 }],
      ['HEAT SHIMMER', 'DEATH VALLEY', '14:50', 'mesh', ['#F1C9A5', '#E3C27A', '#F5E6C8', '#E8925A'], { weather: { heat: 0.6, fog: 0.3, haze: 0.25 }, motion: { mode: 'flow', speed: 0.4, duration: 8 } }],
      ['CANYON WALL', 'ATACAMA', '16:15', 'linear', ['#F29A5E', '#C8643B', '#A64B2A', '#7A2E1E'], { angle: 120, weather: { frost: 0.45 } }],
      ['MIRAGE', 'NAMIB', '12:12', 'radial', ['#F5E6C8', '#F1C9A5', '#A9C8EC'], { center: { x: 0.5, y: 0.9 }, weather: { heat: 0.5, haze: 0.25 } }],
      ['LENÇÓIS', 'LENÇÓIS MARANHENSES', '06:40', 'mesh', ['#E9E2D2', '#BFD9CF', '#8FC5C6', '#4D98A8', '#2B5B70', '#C4B38F'], { background: '#D9D2C0', weather: { fog: 0.45, haze: 0.3 } }],
      ['DUST DEVIL', 'SAHARA', '15:33', 'conic', ['#D9B48A', '#B88A5A', '#EFD9B4', '#D9B48A'], { weather: { fog: 0.5, haze: 0.45 } }],
      ['ADOBE NOON', 'CAPPADOCIA', '12:00', 'mesh', ['#E8925A', '#F5E6C8', '#8C5A3C', '#F9C79A'], soft],
      ['BLEACHED BONE', 'NAMIB', '11:11', 'frame', ['#FBF6EE', '#EFD9B4', '#D9B48A'], frame(4, 'arch')],
    ],
  },
  forest: {
    title: 'FOREST',
    blurb: 'Canopy light, fern shade and old growth.',
    rows: [
      ['WET CANOPY', 'AMAZON', '07:30', 'mesh', ['#2F6B4F', '#7BAE6E', '#1F3A2B', '#A9CB8C'], soft],
      ['OLD GROWTH', 'YAKUSHIMA FOREST', '09:50', 'linear', ['#A9CB8C', '#4E8C5A', '#1F3A2B'], { angle: 180, ...grainy }],
      ['FERN LIGHT', 'BORNEO', '11:15', 'radial', ['#D6E8BF', '#7BAE6E', '#2F6B4F'], { center: { x: 0.7, y: 0.2 }, weather: { fog: 0.3, haze: 0.2 } }],
      ['MOSS FLOOR', 'YAKUSHIMA FOREST', '14:02', 'frame', ['#D6E8BF', '#7BAE6E', '#3B4A34'], frame(3, 'circle')],
      ['SPRING SHOOT', 'PROVENCE', '08:08', 'linear', ['#FBF6EE', '#D6E8BF', '#A9CB8C'], { angle: 160 }],
      ['LICHEN', 'LOFOTEN', '12:40', 'mesh', ['#8FA88A', '#56694A', '#D8D4CC', '#C7D36F'], { weather: { frost: 0.3, haze: 0.3 } }],
      ['POLLEN DRIFT', 'PROVENCE', '16:20', 'mesh', ['#C7D36F', '#FFF1A8', '#A9CB8C', '#FBF6EE'], { ...soft, motion: { mode: 'drift', speed: 0.4, duration: 12 } }],
      ['FOREST SHADE', 'BORNEO', '17:45', 'linear', ['#3B4A34', '#1F3A2B', '#0B1026'], { angle: 180, weather: { haze: 0.4, dusk: 0.4 } }],
      ['SAGE HILL', 'BIG SUR', '10:30', 'frame', ['#E9F1F8', '#8FA88A', '#56694A'], frame(2, 'arch')],
    ],
  },
  volcanic: {
    title: 'VOLCANIC',
    blurb: 'Lava veins, basalt and sulphur skies.',
    rows: [
      ['MAGMA VEIN', 'ETNA', '22:22', 'radial', ['#F2D53C', '#FF5A1F', '#7A2E1E', '#191717'], { center: { x: 0.5, y: 0.8 }, weather: { haze: 0.4 } }],
      ['ASH PLUME', 'ETNA', '14:14', 'linear', ['#9E978C', '#4A4442', '#2A2626'], { angle: 180, weather: { clouds: 0.6, haze: 0.4 } }],
      ['LAVA FLOW', 'MAUNA KEA', '23:05', 'mesh', ['#FF5A1F', '#E03A1E', '#191717', '#FF8A3D'], { background: '#191717', weather: { heat: 0.4, haze: 0.35 }, motion: { mode: 'flow', speed: 0.5, duration: 10 } }],
      ['CALDERA', 'ETNA', '20:40', 'frame', ['#191717', '#E03A1E', '#FF8A3D'], frame(3, 'circle')],
      ['SULPHUR SKY', 'ETNA', '06:30', 'linear', ['#F2D53C', '#E3C27A', '#9E978C'], { angle: 0, weather: { haze: 0.3 } }],
      ['OBSIDIAN', 'ETNA', '03:00', 'conic', ['#191717', '#4A4442', '#191717', '#5C5750', '#191717'], { weather: { fog: 0.3, haze: 0.4 } }],
      ['SCORIA FIELD', 'MAUNA KEA', '16:48', 'linear', ['#7A2E1E', '#2A2626', '#191717'], { angle: 180, weather: { frost: 0.5 } }],
      ['FIRE FOUNTAIN', 'ETNA', '00:31', 'mesh', ['#F2D53C', '#FF5A1F', '#191717', '#E03A1E'], { background: '#191717', composition: { symmetry: 'mirror' }, weather: { fog: 0.3, haze: 0.4 } }],
    ],
  },
  bloom: {
    title: 'BLOOM',
    blurb: 'Flower fields and orchard pastels.',
    rows: [
      ['LAVENDER ROW', 'PROVENCE', '18:10', 'linear', ['#E9D5F5', '#B69BD9', '#8E6FB5'], { angle: 180 }],
      ['POPPY HILL', 'CAPPADOCIA', '15:05', 'mesh', ['#E04E4E', '#FFB3A1', '#A9CB8C', '#FBF6EE'], soft],
      ['CHERRY RAIN', 'YAKUSHIMA FOREST', '10:02', 'mesh', ['#FCE7EF', '#F7C6D9', '#F4B6C2', '#FBF6EE'], { weather: { fog: 0.4, haze: 0.25, clouds: 0.2 } }],
      ['SUNFLOWER FIELD', 'PROVENCE', '13:45', 'radial', ['#FFF1A8', '#FFD84D', '#E8925A', '#4E8C5A'], { center: { x: 0.5, y: 0.35 } }],
      ['PEONY', 'PROVENCE', '09:15', 'frame', ['#FCE7EF', '#F7A8B8', '#E89AB8'], frame(4, 'circle')],
      ['WISTERIA', 'CAPPADOCIA', '16:30', 'linear', ['#E9D5F5', '#C2E0F2', '#B69BD9'], { angle: 200, ...soft }],
      ['FUCHSIA GROVE', 'BORNEO', '12:25', 'mesh', ['#FF7AA8', '#9C3D6B', '#FFB3A1', '#E13CA8'], soft],
      ['PLUM ORCHARD', 'PROVENCE', '19:40', 'frame', ['#FCE7EF', '#9C3D6B', '#4B2A7B'], frame(3)],
      ['FORGET-ME-NOT', 'LOFOTEN', '11:50', 'radial', ['#FBF6EE', '#C2E0F2', '#7FA6D9'], { weather: { fog: 0.3, haze: 0.2 } }],
    ],
  },
  ice: {
    title: 'ICE',
    blurb: 'Crevasse blue, hoarfrost and polar night.',
    rows: [
      ['CREVASSE', 'ANTARCTIC SHELF', '13:20', 'linear', ['#EAF6FF', '#A8D8F0', '#4F8FBF', '#2D5F8A'], { angle: 180 }],
      ['HOARFROST', 'SVALBARD', '08:44', 'mesh', ['#F7FBFF', '#DCEEFA', '#BFE3E8', '#EAF6FF'], { weather: { frost: 0.3, haze: 0.2, fog: 0.2 } }],
      ['GLACIER HOUR', 'ICELAND FJORD', '03:12', 'linear', ['#DCEEFA', '#6FA3B8', '#2D5F8A'], { angle: 180, ...grainy }],
      ['POLAR NIGHT', 'SVALBARD', '12:00', 'radial', ['#2D5F8A', '#141B3A', '#0B1026'], { center: { x: 0.5, y: 1 }, weather: { haze: 0.4 } }],
      ['ICE SHELF', 'ANTARCTIC SHELF', '10:10', 'frame', ['#F7FBFF', '#A8D8F0', '#4F8FBF'], frame(3)],
      ['FRESH POWDER', 'PATAGONIA', '09:00', 'linear', ['#F7FBFF', '#EAF6FF', '#C2E0F2'], { angle: 180, weather: { haze: 0.3 } }],
      ['GLACIER MELT', 'ICELAND FJORD', '15:15', 'mesh', ['#7CC1E4', '#EAF6FF', '#35A7B8', '#BFE3E8'], { ...soft, motion: { mode: 'drift', speed: 0.3, duration: 12 } }],
      ['WHITEOUT', 'ANTARCTIC SHELF', '14:00', 'frame', ['#F7FBFF', '#DCEEFA', '#F7FBFF'], { composition: { count: 2, softness: 1 }, weather: { fog: 0.7, haze: 0.3 } }],
      ['ICEBERG', 'SVALBARD', '11:40', 'conic', ['#EAF6FF', '#7CC1E4', '#2D5F8A', '#EAF6FF'], { composition: { symmetry: 'kaleido', slices: 6 }, weather: { fog: 0.4, haze: 0.2 } }],
    ],
  },
  light: {
    title: 'LIGHT WORKS',
    blurb: 'Apertures, horizons and rings of light, for walls and LEDs.',
    rows: [
      ['SKYSPACE', 'RODEN CRATER', '19:40', 'aperture', ['#15131F', '#6B4FA0', '#F2C9A8'], { composition: { size: 0.62, softness: 0.5, glow: 0.5 }, weather: { fog: 0.2, haze: 0.2 } }],
      ['APERTURE VIOLET', 'RODEN CRATER', '19:12', 'aperture', ['#0B1026', '#6B4AB8', '#F2C9B8'], { composition: { size: 0.72, softness: 0.7, glow: 0.6 }, weather: { fog: 0.35, haze: 0.3 } }],
      ['GANZFELD', 'MAUNA KEA', '21:05', 'aperture', ['#1B1430', '#C24DF0', '#FF8FB0'], { composition: { shape: 'circle', size: 0.85, softness: 0.95, glow: 0.8 }, weather: { fog: 0.4, haze: 0.2 } }],
      ['CHAPEL LIGHT', 'PROVENCE', '07:20', 'aperture', ['#E9E2D6', '#F6B47A', '#FFF1DC'], { composition: { shape: 'arch', size: 0.6, softness: 0.4, glow: 0.35 }, weather: { haze: 0.25 } }],
      ['SEA HORIZON', 'ICELAND FJORD', '22:10', 'bands', ['#A9C8EC', '#E8D8C8', '#2C3E7A', '#141B3A'], { angle: 180, composition: { count: 4, softness: 0.6 }, weather: { fog: 0.25, haze: 0.3 } }],
      ['ROTHKO DUSK', 'SAHARA', '19:30', 'bands', ['#3B1420', '#C8643B', '#E8744A'], { angle: 180, composition: { count: 3, softness: 0.9 }, weather: { fog: 0.3, haze: 0.35 } }],
      ['TOTALITY', 'ATACAMA', '13:42', 'halo', ['#05060A', '#1B1430', '#F4F1EA'], { composition: { size: 0.55, softness: 0.15, glow: 0.6 }, weather: { haze: 0.3 } }],
      ['MOON RING', 'LOFOTEN', '23:50', 'halo', ['#0B1026', '#2C3E7A', '#DCEEFA'], { composition: { size: 0.85, softness: 0.4, glow: 0.4 }, weather: { fog: 0.2, haze: 0.3 } }],
    ],
  },
};

export const COLLECTIONS: Collection[] = Object.entries(DATA).map(([id, c]) => ({
  id,
  title: c.title,
  blurb: c.blurb,
  gradients: c.rows.map(([name, place, time, type, colors, opts]) => {
    const g = makeGradient({ ...opts, name, place, time, type, colors, collection: id, coords: coordsFor(place) });
    g.id = `preset_${id}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return g;
  }),
}));

export const ALL_PRESETS: Gradient[] = COLLECTIONS.flatMap((c) => c.gradients);
