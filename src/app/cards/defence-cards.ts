import { Card } from './card';

/*
Type of defence cards:
- shield: Completely blocks the drink amount of the last attack card received
- reduce: Reduces the drink amount by a fixed number
- reflect: Reflects the drink amount back to the attacker
- half: Halves the drink amount received
*/

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
  {
    id: 'def-005',
    type: 'defence',
    title: 'Vegardo',
    description:
      'Vagardo tryller vekk problemene dine. Neste gang du må drikke fjernes 1 slurker fra totalen.',
    drinkAmount: 1,
    passive: ['reduce'],
  },
  {
    id: 'def-006',
    type: 'defence',
    title: 'Nei, pls a!',
    description: 'Jeg orker ikke en slurk til! Pls la meg stå over en slurk!',
    drinkAmount: 1,
    passive: ['reduce'],
  },
  {
    id: 'def-007',
    type: 'defence',
    title: 'Alt for sliten',
    description: 'Kan ikke drikke om man sover. Dropp å drikk!',
    drinkAmount: 0,
    passive: ['shield'],
  },
  {
    id: 'def-008',
    type: 'defence',
    title: 'Bjonni på chillern',
    description: 'Han orker ikke å drikke SÅÅÅ mye. Halver drikkemengden du mottar!',
    drinkAmount: 0,
    passive: ['half'],
  },
  {
    id: 'def-009',
    type: 'defence',
    title: 'Waifu-pillow',
    description:
      'I have the power of god and anime on my side! Reduserer drikkemengden du mottar med!',
    drinkAmount: 2,
    passive: ['reduce'],
  },
  {
    id: 'def-010',
    type: 'defence',
    title: 'Sku sett han andre',
    description: 'Du skulle sett han andre! Reflekterer drikkemengden tilbake til angriperen!',
    drinkAmount: 0,
    passive: ['reflect'],
  },
  {
    id: 'def-011',
    type: 'defence',
    title: 'Sliten Mosern',
    description: 'Ser ikke ut som Mosern orker mer drikking i kveld. Dropp noen slurker!',
    drinkAmount: 2,
    passive: ['reduce'],
  },
  {
    id: 'def-012',
    type: 'defence',
    title: 'Snuff',
    description:
      'Kim snuffa så hardt at slrukene gikk i retur! Reflekterer drikkemengden tilbake til angriperen!',
    drinkAmount: 0,
    passive: ['reflect'],
  },
];
