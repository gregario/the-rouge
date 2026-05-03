/**
 * Discipline registry — canonical tier mappings for seeding flow.
 */

const DISCIPLINE_TIERS = {
  brainstorming: 'XS',
  competition: 'M',
  taste: 'XS',
  sizing: 'XS',
  spec: 'XS',
  infrastructure: 'S',
  design: 'S',
  'legal-privacy': 'S',
  marketing: 'M',
};

const TIER_ORDER = ['XS', 'S', 'M', 'L', 'XL'];

function listApplicable(projectSize) {
  const sizeIndex = TIER_ORDER.indexOf(projectSize);
  if (sizeIndex === -1) {
    throw new Error(`Invalid project size: ${projectSize}`);
  }

  return Object.entries(DISCIPLINE_TIERS)
    .filter(([_discipline, tier]) => {
      const tierIndex = TIER_ORDER.indexOf(tier);
      return tierIndex <= sizeIndex;
    })
    .map(([discipline, _tier]) => discipline);
}

function getTier(discipline) {
  return DISCIPLINE_TIERS[discipline] || null;
}

module.exports = {
  DISCIPLINE_TIERS,
  TIER_ORDER,
  listApplicable,
  getTier,
};
