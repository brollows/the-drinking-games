import { Card } from './card';

/*
Type of attack cards:
- none: Standard attack card with no special properties
- random: The drink amount is assigned to a random player
*/

export const ATTACK_CARDS: Card[] = [
  {
    id: 'atk-001',
    type: 'attack',
    title: 'Heia på gjerdet',
    description: 'Heia falt av gjerdet! Han traff deg så du snubla i ølen din.',
    drinkAmount: 2,
    passive: ['none'],
  },
  {
    id: 'atk-002',
    type: 'attack',
    title: 'Järn',
    description: 'Ole kasta Järn. Massive damage!',
    drinkAmount: 3,
    passive: ['none'],
  },
  {
    id: 'atk-003',
    type: 'attack',
    title: 'Forehand',
    description: 'Mostue mener det kun er en ting som slår forehand... foreskin...',
    drinkAmount: 2,
    passive: ['none'],
  },
  {
    id: 'atk-004',
    type: 'attack',
    title: 'Broren min!',
    description: 'Drekka på!',
    drinkAmount: 3,
    passive: ['none'],
  },
  {
    id: 'atk-005',
    type: 'attack',
    title: 'Russian roulette',
    description:
      'Dekke kortet kan ikke velges hvem som får. Det blir sendt random til noen, inkludert deg selv, uten å kunne blokkes eller redusere antall slurker!',
    drinkAmount: 10,
    passive: ['random'],
  },
  {
    id: 'atk-006',
    type: 'attack',
    title: 'Russian roulette',
    description:
      'Dekke kortet kan ikke velges hvem som får. Det blir sendt random til noen, inkludert deg selv, uten å kunne blokkes eller redusere antall slurker!',
    drinkAmount: 5,
    passive: ['random'],
  },
  {
    id: 'atk-007',
    type: 'attack',
    title: 'Massive damage!',
    description: 'Her ser du hva som skjer når du messar med feil folk! Drekka på!',
    drinkAmount: 3,
    passive: ['none'],
  },
  {
    id: 'atk-008',
    type: 'attack',
    title: 'I am the cap now',
    description: '2 slurker ligger klare for han på stryrbordet!',
    drinkAmount: 2,
    passive: ['none'],
  },
  {
    id: 'atk-009',
    type: 'attack',
    title: 'Tannlaus',
    description: 'Det er a plass til en ekstra slurk med de tenna der, drekka på!',
    drinkAmount: 1,
    passive: ['none'],
  },
  {
    id: 'atk-010',
    type: 'attack',
    title: 'Mein Führer!',
    description: 'Du musst auf mich, den Anführer, hören! Trink ein paar Schlucke!',
    drinkAmount: 3,
    passive: ['none'],
  },
  {
    id: 'atk-011',
    type: 'attack',
    title: 'Rizz!',
    description: 'Du har mad rizz! Drekka på!',
    drinkAmount: 2,
    passive: ['none'],
  },
  {
    id: 'atk-012',
    type: 'attack',
    title: 'Kantet',
    description: 'Du ble kantet av en råning! Drekka på!',
    drinkAmount: 6,
    passive: ['none'],
  },
  {
    id: 'atk-013',
    type: 'attack',
    title: 'Smells like...',
    description: 'Lukter som noen på ta noen slurker nå ja!',
    drinkAmount: 2,
    passive: ['none'],
  },
  {
    id: 'atk-014',
    type: 'attack',
    title: 'Nuno',
    description: 'A wild Nuno appeard! Han tvinger noen til å drikke masse slurker!',
    drinkAmount: 6,
    passive: ['random'],
  },
  {
    id: 'atk-014',
    type: 'attack',
    title: 'Nuno',
    description: 'A wild Nuno appeard! Han tvinger noen til å drikke masse slurker!',
    drinkAmount: 6,
    passive: ['none'],
  },
];
