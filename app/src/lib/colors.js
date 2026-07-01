// Single source of truth for the selectable member-color palette.
// These hexes match COLOR_MAP in screens/Main.jsx (the render map), so a
// color chosen here looks identical everywhere it's drawn. COLOR_MAP may
// carry extra legacy ids (peach/lemon/moss) for members who picked them
// on the old signup screen — those stay renderable but are no longer
// offered for new selection.
export const PALETTE = [
  { id: 'red',         hex: '#E63946', label: 'Red' },
  { id: 'coral',       hex: '#FF6B35', label: 'Coral' },
  { id: 'amber',       hex: '#FFD60A', label: 'Amber' },
  { id: 'green',       hex: '#2DC653', label: 'Green' },
  { id: 'teal',        hex: '#00B4D8', label: 'Teal' },
  { id: 'blue',        hex: '#4361EE', label: 'Blue' },
  { id: 'periwinkle',  hex: '#7B2FBE', label: 'Periwinkle' },
  { id: 'plum',        hex: '#C77DFF', label: 'Plum' },
  { id: 'lilac',       hex: '#F72585', label: 'Lilac' },
  { id: 'rose',        hex: '#FF86C8', label: 'Rose' },
  { id: 'black',       hex: '#2D2D2D', label: 'Black' },
];

// Legacy ids: picked on the old signup screen, no longer offered, still
// renderable so those members' dots/chips don't fall through to gray.
const LEGACY_COLORS = { peach: '#FFC18C', lemon: '#F0E68C', moss: '#C8D685' };

// id → hex render map, derived from PALETTE (single source) + legacy ids, so a
// hex is never hand-maintained in two files. getColor(id) reads this.
export const COLOR_MAP = {
  ...Object.fromEntries(PALETTE.map(p => [p.id, p.hex])),
  ...LEGACY_COLORS,
};
