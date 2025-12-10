import { Card } from './card';

export const ATTACK_CARDS: Card[] = [
    {
        id: 'atk-001',
        type: 'attack',
        title: 'Dobbel Slurk',
        description: 'Velg en spiller som må ta to slurker.',
        drinkAmount: 2,
        passive: ['none']
    },
    {
        id: 'atk-002',
        type: 'attack',
        title: 'Tordenkile',
        description: 'Et kraftig angrep som sender tre slurker til én spiller.',
        drinkAmount: 3,
        passive: ['none']
    },
    {
        id: 'atk-003',
        type: 'attack',
        title: 'Kongens Raseri',
        description: 'Et massivt angrep – velg én som må ta fem slurker.',
        drinkAmount: 5,
        passive: ['none']
    },
    {
        id: 'atk-004',
        type: 'attack',
        title: 'Gjenskap Angrep',
        description: 'Gjør skade på to spillere istedenfor én.',
        drinkAmount: 1,
        passive: ['reflect'] // betyr “kan reflektere av forsvar”
    }
];
