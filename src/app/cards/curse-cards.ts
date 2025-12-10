import { Card } from './card';

export const CURSE_CARDS: Card[] = [
    {
        id: 'cur-001',
        type: 'curse',
        title: 'Tunge Fingre',
        description: 'Du mister neste tur.',
        drinkAmount: 0,
        passive: ['skip']
    },
    {
        id: 'cur-002',
        type: 'curse',
        title: 'Kronens Øye',
        description: 'Alle peker på deg – du tar to slurker.',
        drinkAmount: 2,
        passive: ['none']
    },
    {
        id: 'cur-003',
        type: 'curse',
        title: 'Slurkeplikt',
        description: 'Du må ta en slurk hver gang du snakker i én runde.',
        drinkAmount: 1,
        passive: ['reduce'] // du blir “svekket”
    },
    {
        id: 'cur-004',
        type: 'curse',
        title: 'Kongeskip',
        description: 'Hopp over din neste defensiv handling.',
        drinkAmount: 0,
        passive: ['skip']
    }
];
