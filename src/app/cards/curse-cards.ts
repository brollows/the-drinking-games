import { Card } from './card';

/*
Type of curse cards:
- double: Doubles the drink amount of the last attack card received
- skip: Skip your next turn
- increase: Increases the drink amount by a fixed number
*/

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
  {
    id: 'cur-005',
    type: 'curse',
    title: 'Er du ikke bror?',
    description: 'En bror i nøden er en bror for livet! Ta noen ekstra slurker nå!',
    drinkAmount: 2,
    passive: ['increase'],
  },
  {
    id: 'cur-006',
    type: 'curse',
    title: 'Aktiv!',
    description: 'Du må betale provisjon. Det koster 2 ekstra slurker!',
    drinkAmount: 2,
    passive: ['increase'],
  },
  {
    id: 'cur-007',
    type: 'curse',
    title: 'Retard!',
    description: 'Klarer du ikke å telle eller? Ta 2 slurker ekstra!',
    drinkAmount: 2,
    passive: ['increase'],
  },
  {
    id: 'cur-008',
    type: 'curse',
    title: 'Bonk!',
    description: 'Niandertaner-Kjetil bonker deg i hodet. Dobbelt slurker på deg!',
    drinkAmount: 0,
    passive: ['double'],
  },
  {
    id: 'cur-009',
    type: 'curse',
    title: 'The one!',
    description: 'The one, the only, PEAK TORE',
    drinkAmount: 2,
    passive: ['increase'],
  },
  {
    id: 'cur-010',
    type: 'curse',
    title: 'Smug',
    description:
      'Du ble rizzet av Tore. Han er for kul. Drikke 2 ekstra slurker før han viser deg slången sin.',
    drinkAmount: 2,
    passive: ['increase'],
  },
  {
    id: 'cur-011',
    type: 'curse',
    title: 'Bryllup',
    description: 'Tar på med bryllup. Hopp over turen din.',
    drinkAmount: 0,
    passive: ['skip'],
  },
  {
    id: 'cur-012',
    type: 'curse',
    title: 'Sigge pause',
    description: 'Ta den en pause med en sigg! Hopp over turen din.',
    drinkAmount: 0,
    passive: ['skip'],
  },
  {
    id: 'cur-013',
    type: 'curse',
    title: 'Sigge pause',
    description: 'Ta den en pause med en sigg! Hopp over turen din.',
    drinkAmount: 0,
    passive: ['skip'],
  },
];
