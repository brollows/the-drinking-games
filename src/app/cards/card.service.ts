import { Injectable } from '@angular/core';
import { Card, CardType } from './card';
import { ATTACK_CARDS } from './attack-cards';
import { DEFENCE_CARDS } from './defence-cards';
import { CURSE_CARDS } from './curse-cards';

@Injectable({ providedIn: 'root' })
export class CardService {

    getCardsByType(type: CardType): Card[] {
        switch (type) {
            case 'attack': return ATTACK_CARDS;
            case 'defence': return DEFENCE_CARDS;
            case 'curse': return CURSE_CARDS;
        }
    }

    drawRandom(type: CardType): Card {
        const cards = this.getCardsByType(type);
        return cards[Math.floor(Math.random() * cards.length)];
    }

    drawFromAll(): Card {
        const all = [
            ...ATTACK_CARDS,
            ...DEFENCE_CARDS,
            ...CURSE_CARDS
        ];
        return all[Math.floor(Math.random() * all.length)];
    }
}
