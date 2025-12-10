import { Card } from './card';

export const DEFENCE_CARDS: Card[] = [
    {
        id: 'def-001',
        type: 'defence',
        title: 'Skjoldblokk',
        description: 'Blokker et angrep helt.',
        drinkAmount: 0,
        passive: ['shield']
    },
    {
        id: 'def-002',
        type: 'defence',
        title: 'Reduksjon',
        description: 'Reduserer drikkingsmengden du mottar med 2.',
        drinkAmount: 0,
        passive: ['reduce', 'reduce'] // to reduksjoner
    },
    {
        id: 'def-003',
        type: 'defence',
        title: 'Omvendt Angrep',
        description: 'Sender skaden tilbake til angriperen.',
        drinkAmount: 0,
        passive: ['reflect']
    },
    {
        id: 'def-004',
        type: 'defence',
        title: 'Skipp',
        description: 'Unngå alt denne runden.',
        drinkAmount: 0,
        passive: ['skip']
    }
];
