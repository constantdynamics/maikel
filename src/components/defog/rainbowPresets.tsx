export interface RainbowPreset {
  id: string;
  name: string;
  colors: string[];      // Colors from highest distance to lowest
  thresholds: number[];  // Distance % thresholds (descending)
}

export const RAINBOW_PRESETS: RainbowPreset[] = [
  // === RAINBOW VARIANTS (7) ===
  {
    id: 'classic',
    name: 'Klassiek Regenboog',
    colors: ['#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#88cc00', '#44bb00', '#00ff44'],
    thresholds: [100, 50, 25, 15, 10, 5, 0],
  },
  {
    id: 'rainbow-vivid',
    name: 'Felgekleurd Regenboog',
    colors: ['#ff0055', '#ff6600', '#ffdd00', '#00ff66', '#00ccff', '#6644ff', '#cc00ff'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'rainbow-soft',
    name: 'Zacht Regenboog',
    colors: ['#e87474', '#e8a474', '#e8d474', '#a4d474', '#74c4a4', '#74a4c4', '#9474c4'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'rainbow-neon',
    name: 'Neon Regenboog',
    colors: ['#ff0066', '#ff3300', '#ff9900', '#ccff00', '#00ff99', '#00ccff', '#9933ff'],
    thresholds: [80, 40, 25, 15, 8, 3, 0],
  },
  {
    id: 'rainbow-pastel',
    name: 'Pastel Regenboog',
    colors: ['#ffb3b3', '#ffd9b3', '#fff2b3', '#d9ffb3', '#b3ffd9', '#b3e6ff', '#d9b3ff'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'rainbow-dark',
    name: 'Donker Regenboog',
    colors: ['#990033', '#994400', '#998800', '#669900', '#339966', '#336699', '#663399'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'rainbow-wide',
    name: 'Breed Regenboog',
    colors: ['#ff0000', '#ff5500', '#ffaa00', '#ffff00', '#aaff00', '#55ff00', '#00ff55', '#00ffaa', '#00ffff'],
    thresholds: [200, 100, 60, 40, 25, 15, 8, 3, 0],
  },

  // === WARM PALETTES (5) ===
  {
    id: 'fire',
    name: 'Vuur',
    colors: ['#4a0000', '#8b0000', '#cc2200', '#ff4400', '#ff7700', '#ffaa00', '#ffdd44'],
    thresholds: [100, 60, 35, 20, 12, 5, 0],
  },
  {
    id: 'sunset',
    name: 'Zonsondergang',
    colors: ['#1a0033', '#660044', '#cc3366', '#ff6644', '#ff9944', '#ffcc66', '#ffee99'],
    thresholds: [100, 60, 35, 20, 12, 5, 0],
  },
  {
    id: 'autumn',
    name: 'Herfst',
    colors: ['#5c1a00', '#8b3a00', '#b35a00', '#cc7a00', '#dda020', '#c4b040', '#88aa44'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'lava',
    name: 'Lava',
    colors: ['#330000', '#660000', '#aa0000', '#dd2200', '#ff5500', '#ff8833', '#ffbb66'],
    thresholds: [100, 60, 40, 25, 15, 8, 0],
  },
  {
    id: 'peach',
    name: 'Perzik',
    colors: ['#cc5544', '#dd7766', '#ee9988', '#ffbbaa', '#ffd4cc', '#ffe8e0', '#fff5f0'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },

  // === COOL PALETTES (5) ===
  {
    id: 'ocean',
    name: 'Oceaan',
    colors: ['#000033', '#003366', '#006699', '#0099cc', '#00bbdd', '#44ddee', '#88eeff'],
    thresholds: [100, 60, 35, 20, 12, 5, 0],
  },
  {
    id: 'arctic',
    name: 'Arctisch',
    colors: ['#0a1628', '#1a3050', '#2a5080', '#4488bb', '#66aadd', '#99ccee', '#ccddff'],
    thresholds: [100, 60, 35, 20, 12, 5, 0],
  },
  {
    id: 'forest',
    name: 'Bos',
    colors: ['#0a2210', '#1a4420', '#2a6630', '#3a8840', '#55aa55', '#77cc66', '#99ee88'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'mint',
    name: 'Mint',
    colors: ['#004433', '#006644', '#008855', '#00aa77', '#44cc99', '#77ddbb', '#aaeedd'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'ice',
    name: 'IJs',
    colors: ['#e0e8ff', '#c8d8ff', '#b0c8ff', '#90b0ee', '#7098dd', '#5080cc', '#3060aa'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },

  // === PURPLE / PINK (4) ===
  {
    id: 'purple',
    name: 'Paars',
    colors: ['#1a0033', '#330066', '#550099', '#7722cc', '#9944ee', '#bb77ff', '#ddaaff'],
    thresholds: [100, 60, 35, 20, 12, 5, 0],
  },
  {
    id: 'berry',
    name: 'Bessen',
    colors: ['#2d0040', '#550066', '#880088', '#aa33aa', '#cc55bb', '#dd88cc', '#eeb8dd'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'pink',
    name: 'Roze',
    colors: ['#660033', '#993366', '#cc5588', '#ee77aa', '#ff99bb', '#ffbbcc', '#ffdde8'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'lavender',
    name: 'Lavendel',
    colors: ['#3a2266', '#5533aa', '#7755cc', '#9977dd', '#bb99ee', '#ccaaff', '#e0ccff'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },

  // === MONOCHROME / SPECIAL (5) ===
  {
    id: 'grayscale',
    name: 'Grijstinten',
    colors: ['#222222', '#444444', '#666666', '#888888', '#aaaaaa', '#cccccc', '#eeeeee'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'gold',
    name: 'Goud',
    colors: ['#3d2b00', '#6b4d00', '#9a7000', '#c99400', '#ddb020', '#eec840', '#ffe070'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'copper',
    name: 'Koper',
    colors: ['#3d1f0a', '#6b3a1a', '#995530', '#b87040', '#cc8855', '#dda070', '#eeb888'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'matrix',
    name: 'Matrix',
    colors: ['#001100', '#003300', '#005500', '#007700', '#009900', '#00bb00', '#00ff00'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    colors: ['#0a0020', '#220066', '#5500aa', '#8800cc', '#cc00ff', '#ff00cc', '#ff3399'],
    thresholds: [100, 60, 35, 20, 12, 5, 0],
  },

  // === DEFOG BRANDED / FUN (4) ===
  {
    id: 'defog',
    name: 'Defog Kleuren',
    colors: ['#ff3366', '#ff6644', '#ff8800', '#ffcc00', '#77ee33', '#00ff88', '#00ddaa'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
  {
    id: 'traffic',
    name: 'Stoplicht',
    colors: ['#cc0000', '#dd4400', '#ee8800', '#ddcc00', '#88bb00', '#44aa00', '#00aa00'],
    thresholds: [80, 40, 25, 15, 8, 3, 0],
  },
  {
    id: 'heatmap',
    name: 'Heatmap',
    colors: ['#000033', '#220066', '#6600aa', '#aa0088', '#dd2244', '#ff6600', '#ffcc00'],
    thresholds: [100, 60, 40, 25, 15, 8, 0],
  },
  {
    id: 'earth',
    name: 'Aarde',
    colors: ['#2d1b00', '#4a3520', '#6b5540', '#8a7560', '#a09070', '#b8a888', '#d0c4a8'],
    thresholds: [100, 50, 30, 20, 10, 5, 0],
  },
];
