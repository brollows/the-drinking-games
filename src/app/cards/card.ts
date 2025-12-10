export type CardType = 'attack' | 'defence' | 'curse';

export type PassiveType =
    | 'reduce'    // reduserer skade/slurker mottaker får
    | 'skip'      // hopper over neste tur
    | 'reflect'   // sender angrepet tilbake
    | 'shield'    // blokkerer et angrep
    | 'none';     // ingen passiv effekt

export interface Card {
    id: string;
    type: CardType;
    title: string;
    description: string;

    // Antall slurker kortet sender / påfører
    drinkAmount: number;

    // Ett eller flere passive effekter
    passive: PassiveType[];
}
