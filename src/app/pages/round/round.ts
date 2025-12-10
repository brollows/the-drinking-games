import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GameSessionService, Player, RoundState } from '../../services/game-session.service';
import { CardService } from '../../cards/card.service';
import { Card } from '../../cards/card';

@Component({
  selector: 'app-round',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './round.html',
  styleUrl: './round.css',
})
export class RoundComponent implements OnInit, OnDestroy {
  sessionId: string | null = null;

  // 👇 nå med 'drinking' også
  viewState: 'playing' | 'waiting' | 'drinking' | 'lost' | 'finished' = 'waiting';

  hand: Card[] = [];
  selectedIndex: number | null = null;

  currentLives: number | null = null;
  players: Player[] = [];
  currentTurnPlayerId: string | null = null;

  lastPlayedCard: Card | null = null;
  lastPlayedBy: Player | null = null;
  lastPlayedTarget: Player | null = null;

  roundState: RoundState | null = null;

  selectingTarget = false;
  targetCandidates: Player[] = [];
  pendingCardToPlay: Card | null = null;
  selectedTargetId: string | null = null;

  private me: Player | null = null;
  private pollingInterval: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private gameSession: GameSessionService,
    private cards: CardService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId');

    if (!this.sessionId && this.gameSession.currentSession) {
      this.sessionId = this.gameSession.currentSession.id;
    }

    if (!this.sessionId) {
      this.router.navigate(['/']);
      return;
    }

    console.log('Round page for session:', this.sessionId);

    // hvem er jeg (lokalt cached player fra GameSessionService)
    this.me = this.gameSession.currentPlayer ?? null;

    // gi meg en test-hånd
    this.dealInitialHand(3);

    // første oppdatering
    await this.refreshState();

    // polling av både players + round_state
    this.pollingInterval = setInterval(() => {
      this.refreshState();
    }, 500);
  }

  ngOnDestroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private async refreshState() {
    if (!this.sessionId) return;

    try {
      const [players, roundState] = await Promise.all([
        this.gameSession.getPlayersForSession(this.sessionId),
        this.gameSession.getRoundState(this.sessionId),
      ]);

      this.players = players;
      this.roundState = roundState;

      const meId = this.me?.id ?? null;

      // oppdater "meg" fra players-lista (så lives er fresh)
      if (meId) {
        const meFromList = this.players.find((p) => p.id === meId) ?? null;
        if (meFromList) {
          this.me = meFromList;
          this.currentLives = meFromList.lives;
        }
      }

      // hvis jeg er død => lost view
      if (this.currentLives !== null && this.currentLives <= 0) {
        this.viewState = 'lost';
      }

      // hvem har tur?
      if (roundState && roundState.turnOrder.length > 0) {
        this.currentTurnPlayerId = roundState.turnOrder[roundState.currentTurnIndex] ?? null;
      } else {
        this.currentTurnPlayerId = null;
      }

      // sist spilte kort + hvem som spilte / fikk det
      this.syncLastPlayedFromRoundState();

      // bestemme viewState, men ikke override lost/finished
      if (this.viewState !== 'lost' && this.viewState !== 'finished') {
        this.updateViewStateFromRoundState();
      }

      try {
        this.cdr.detectChanges();
      } catch {
        // ignorer hvis view er destroyed
      }
    } catch (e) {
      console.error('Kunne ikke refreshState i round:', e);
    }
  }

  private syncLastPlayedFromRoundState() {
    const rs = this.roundState;
    if (!rs) {
      this.lastPlayedCard = null;
      this.lastPlayedBy = null;
      this.lastPlayedTarget = null;
      return;
    }

    if (rs.lastCardId) {
      try {
        this.lastPlayedCard = this.cards.getCardById(rs.lastCardId);
      } catch {
        this.lastPlayedCard = null;
      }
    } else {
      this.lastPlayedCard = null;
    }

    this.lastPlayedBy = this.players.find((p) => p.id === rs.lastFromPlayerId) ?? null;
    this.lastPlayedTarget = this.players.find((p) => p.id === rs.lastToPlayerId) ?? null;
  }

  private updateViewStateFromRoundState() {
    const rs = this.roundState;
    const meId = this.me?.id ?? null;

    if (!rs || !meId) {
      this.viewState = 'waiting';
      return;
    }

    // 🧨 1) Pending attack trumfer alt:
    if (rs.pendingAttack) {
      // Jeg er target → jeg er i DRINKING
      if (rs.pendingAttackToPlayerId === meId) {
        this.viewState = 'drinking';
      } else {
        // Jeg er ikke target → jeg bare venter
        this.viewState = 'waiting';
      }
      return;
    }

    // ✅ 2) Ingen pending attack: vanlig tur-logikk
    const currentTurnId = rs.turnOrder[rs.currentTurnIndex] ?? null;

    if (currentTurnId === meId) {
      this.viewState = 'playing';
    } else {
      this.viewState = 'waiting';
    }
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

  getCardTypeUpper(card: Card): string {
    return card.type.toUpperCase();
  }

  get currentTurnPlayer(): Player | null {
    if (!this.currentTurnPlayerId) return null;
    return this.players.find((p) => p.id === this.currentTurnPlayerId) ?? null;
  }

  trackPlayer(index: number, player: Player) {
    return player.id;
  }

  // 🧨 Spiller med tur trykker "Spill dette kortet"
  async onPlaySelectedCard() {
    const card = this.selectedCard;
    const me = this.me;
    const sessionId = this.sessionId;

    if (!card || !me || !sessionId) {
      return;
    }

    try {
      if (card.type === 'defence') {
        // DEFENCE: alltid på deg selv
        await this.gameSession.playDefenceCard(sessionId, me.id, card.id);
        await this.gameSession.advanceTurn(sessionId);

        // Fjern kortet fra hånda og trekk nytt
        this.removePlayedCardAndDrawNew();
        return;
      }

      if (card.type === 'attack' || card.type === 'curse') {
        // Gå inn i target selection-modus
        const candidates = this.players.filter((p) => p.id !== me.id && p.lives > 0);

        if (!candidates.length) {
          console.warn('Ingen gyldige targets å velge.');
          return;
        }

        this.selectingTarget = true;
        this.targetCandidates = candidates;
        this.pendingCardToPlay = card;
        this.selectedTargetId = candidates[0].id; // preselect første
        return;
      }

      // skulle ikke skje, men bare i tilfelle vi får nye typer senere
    } catch (e) {
      console.error('Feil ved spilling av kort:', e);
    }
  }

  private removePlayedCardAndDrawNew() {
    if (this.selectedIndex != null) {
      this.hand.splice(this.selectedIndex, 1);
    }

    const newCard = this.cards.drawFromAll();
    this.hand.push(newCard);
    this.selectedIndex = this.hand.length - 1;

    // reset target-valg state
    this.selectingTarget = false;
    this.targetCandidates = [];
    this.pendingCardToPlay = null;
    this.selectedTargetId = null;
  }

  // 🍻 Target (drinking-state) trykker "Jeg har drukket"
  async onConfirmDrank() {
    const me = this.me;
    const sessionId = this.sessionId;

    if (!me || !sessionId) return;

    try {
      await this.gameSession.resolveAttackAndAdvanceTurn(sessionId, me.id, (id) =>
        this.cards.getCardById(id)
      );
      // Etter dette:
      // - lives er oppdatert
      // - effekter er brukt opp
      // - currentTurnIndex er flyttet til neste spiller
      // refreshState() tar seg av UI
    } catch (e) {
      console.error('Feil ved resolveAttackAndAdvanceTurn:', e);
    }
  }

  onSelectTarget(playerId: string) {
    this.selectedTargetId = playerId;
  }

  async onConfirmTargetSelection() {
    const sessionId = this.sessionId;
    const me = this.me;
    const card = this.pendingCardToPlay;
    const targetId = this.selectedTargetId;

    if (!sessionId || !me || !card || !targetId) {
      return;
    }

    try {
      if (card.type === 'attack') {
        await this.gameSession.playAttackCard(sessionId, me.id, targetId, card.id);
        // IKKE advance turn – skjer når target trykker "Jeg har drukket"
      } else if (card.type === 'curse') {
        await this.gameSession.playCurseCard(sessionId, me.id, targetId, card.id);
        // Curse avslutter turen med én gang
        await this.gameSession.advanceTurn(sessionId);
      }

      this.removePlayedCardAndDrawNew();
    } catch (e) {
      console.error('Feil ved bekreftelse av target:', e);
    }
  }

  onCancelTargetSelection() {
    this.selectingTarget = false;
    this.targetCandidates = [];
    this.pendingCardToPlay = null;
    this.selectedTargetId = null;
  }
}
