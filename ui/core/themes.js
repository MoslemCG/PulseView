/** Built-in skins. Color/gradient implementation is entirely in ui/themes/*.css. */
export const BUILTIN_THEMES = Object.freeze([
    { id: 'midnight', name: 'Midnight · Reference', description: 'Navy · magenta / amber / lime', swatches: ['#091426','#f52cdd','#ffad0a','#a3ef25'] },
    { id: 'graphite', name: 'Graphite', description: 'Neutral charcoal · soft neon', swatches: ['#171a20','#f28dd5','#f6bf70','#80eec0'] },
    { id: 'onyx', name: 'Onyx', description: 'Pure black · graphite gray · silver', swatches: ['#141414','#e47ad0','#f0b35a','#9be36a'] },
    { id: 'aurora', name: 'Aurora', description: 'Deep teal · mint / rose', swatches: ['#091d1e','#ee7da9','#efd072','#b6ee73'] },
    { id: 'amethyst', name: 'Amethyst', description: 'Black plum · violet / ice blue', swatches: ['#141027','#ed6dc9','#f8be6b','#72e6d0'] },
    { id: 'cobalt', name: 'Cobalt', description: 'Ink blue · cyan / electric pink', swatches: ['#061324','#ff46c8','#ffd159','#5cf4b0'] },
    { id: 'ember', name: 'Ember', description: 'Warm carbon · copper / coral', swatches: ['#1b1415','#ff6e8e','#ffb24c','#bde778'] },
    { id: 'ivory', name: 'Ivory', description: 'Light surfaces · clear color contrast', swatches: ['#f5f7fa','#c02abd','#d88506','#50a52a'] },
]);
export const themeNames = Object.fromEntries(BUILTIN_THEMES.map(t => [t.id, t.name]));
