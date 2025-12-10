import { Injectable } from '@angular/core';
import { Card, CardType } from './card';
import { ATTACK_CARDS } from './attack-cards';
import { DEFENCE_CARDS } from './defence-cards';
import { CURSE_CARDS } from './curse-cards';

@Injectable({ providedIn: 'root' })
export class CardService {
  getCardsByType(type: CardType): Card[] {
    switch (type) {
      case 'attack':
        return ATTACK_CARDS;
      case 'defence':
        return DEFENCE_CARDS;
      case 'curse':
        return CURSE_CARDS;
    }
  }

  getAllCards(): Card[] {
    return [...ATTACK_CARDS, ...DEFENCE_CARDS, ...CURSE_CARDS];
  }

  drawRandom(type: CardType): Card {
    const cards = this.getCardsByType(type);
    return cards[Math.floor(Math.random() * cards.length)];
  }

  drawFromAll(): Card {
    const all = this.getAllCards();
    return all[Math.floor(Math.random() * all.length)];
  }

  getCardById(id: string): Card {
    const card = this.getAllCards().find((c) => c.id === id);
    if (!card) {
      throw new Error(`Fant ikke kort med id: ${id}`);
    }
    return card;
  }
}
