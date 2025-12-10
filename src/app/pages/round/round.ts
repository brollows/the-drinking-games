import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GameSessionService } from '../../services/game-session.service';
import { CardService } from '../../cards/card.service';
import { Card } from '../../cards/card';

@Component({
    selector: 'app-round',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './round.html',
    styleUrl: './round.css',
})
export class RoundComponent implements OnInit {
    sessionId: string | null = null;

    viewState: 'starting' | 'playing' | 'waiting' | 'lost' | 'finished' = 'playing';

    hand: Card[] = [];
    selectedIndex: number | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private gameSession: GameSessionService,
        private cards: CardService,
    ) { }

    ngOnInit(): void {
        this.sessionId = this.route.snapshot.paramMap.get('sessionId');

        if (!this.sessionId && this.gameSession.currentSession) {
            this.sessionId = this.gameSession.currentSession.id;
        }

        if (!this.sessionId) {
            this.router.navigate(['/']);
            return;
        }

        console.log('Round page for session:', this.sessionId);

        this.viewState = 'playing';
        this.dealInitialHand(3);
    }

    setView(state: typeof this.viewState) {
        this.viewState = state;
    }

    private dealInitialHand(count: number) {
        this.hand = [];
        for (let i = 0; i < count; i++) {
            const card = this.cards.drawFromAll();
            this.hand.push(card);
        }

        this.selectedIndex = this.hand.length > 0 ? this.hand.length - 1 : null;

        console.log('Hånd delt ut:', this.hand);
    }

    onSelectCard(index: number) {
        this.selectedIndex = index;
    }

    get selectedCard(): Card | null {
        if (this.selectedIndex == null) return null;
        return this.hand[this.selectedIndex] ?? null;
    }
}
