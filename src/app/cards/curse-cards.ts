import { Card } from './card';

export const CURSE_CARDS: Card[] = [
  {
    id: 'cur-001',
    type: 'curse',
    title: 'For faen da!',
    description: 'Du må drikke dobbelt så mye som angreps kortet du nettopp fikk!',
    drinkAmount: 0,
    passive: ['double'],
  },
  {
    id: 'cur-002',
    type: 'curse',
    title: 'Skolegangster',
    description: 'Bølla på skolen tok drikka di! Du må stå over denne runden',
    drinkAmount: 0,
    passive: ['skip'],
  },
  {
    id: 'cur-003',
    type: 'curse',
    title: 'Drikkepolitiet',
    description: 'Du drakk litt sløvt i stad, ta ett par ekstra slurker nå!',
    drinkAmount: 2,
    passive: ['increase'],
  },
  {
    id: 'cur-004',
    type: 'curse',
    title: 'Skipet mitt er lastet med',
    description: 'Skipet mitt er lastet med... DOBBELT så mange slurker!',
    drinkAmount: 0,
    passive: ['double'],
  },
];
