const aliases = {
  dairy: ['milk'], milk: ['milk'],
  peanut: ['peanuts'], peanuts: ['peanuts'],
  nut: ['peanuts', 'tree nuts'], nuts: ['peanuts', 'tree nuts'],
  'tree nut': ['tree nuts'], 'tree nuts': ['tree nuts'],
  soya: ['soy'], soybean: ['soy'], soybeans: ['soy'], soy: ['soy'],
  egg: ['eggs'], eggs: ['eggs'],
  wheat: ['wheat'], gluten: ['wheat'],
  fish: ['fish'], shellfish: ['shellfish'], sesame: ['sesame'],
};

function normalizeAllergens(values) {
  if (!Array.isArray(values)) return values;
  return [...new Set(values.flatMap(value => {
    const label = typeof value === 'string' ? value.trim().toLowerCase() : value;
    return aliases[label] || [label];
  }))];
}

function uncertainAllergen(value) {
  return /may contain|trace|possible|cross[- ](?:contact|contamination)|uncertain/i.test(value);
}

module.exports = { normalizeAllergens, uncertainAllergen };
