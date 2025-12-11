import { Card } from './card';

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
];
