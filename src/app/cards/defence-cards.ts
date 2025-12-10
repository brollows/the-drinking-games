import { Card } from './card';

export const DEFENCE_CARDS: Card[] = [
  {
    id: 'def-001',
    type: 'defence',
    title: 'Glem det',
    description: 'Gidder ikke drikke as!',
    drinkAmount: 0,
    passive: ['shield'],
  },
  {
    id: 'def-002',
    type: 'defence',
    title: 'Ikke såååååå tørst...',
    description: 'Reduserer drikkingsmengden du mottar.',
    drinkAmount: 2,
    passive: ['reduce'],
  },
  {
    id: 'def-003',
    type: 'defence',
    title: 'Bezzerwizzer',
    description:
      'Aleks bruker sin provoserende ekspertise til å speile angrepet rett i fleisen på motstanderen!',
    drinkAmount: 0,
    passive: ['reflect'],
  },
  {
    id: 'def-004',
    type: 'defence',
    title: 'Elias på chuggen',
    description: 'Det drikkes alt for sakte, så det får holde med halvparten denne gangen.',
    drinkAmount: 0,
    passive: ['half'],
  },
];
