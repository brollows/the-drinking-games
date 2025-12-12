import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GameSessionService,
  Player,
  PlayerEffect,
  RoundState,
} from '../../services/game-session.service';
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

  pendingAttackCard: Card | null = null;
  pendingAttackEffects: PlayerEffect[] = [];
  attackSequenceCards: Card[] = [];
  pendingAttackTotalDrinks: number | null = null;
  pendingAttackTarget: Player | null = null;

  usedEffectIds: string[] = [];

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

    this.me = this.gameSession.currentPlayer ?? null;

    // 🃏 Start-hånd: alltid [DEFENCE, CURSE, ATTACK]
    this.dealInitialHand();

    await this.refreshState();

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

      if (meId) {
        const meFromList = this.players.find((p) => p.id === meId) ?? null;
        if (meFromList) {
          this.me = meFromList;
          this.currentLives = meFromList.lives;
        }
      }

      if (this.currentLives !== null && this.currentLives <= 0) {
        this.viewState = 'lost';
      }

      if (roundState && roundState.turnOrder.length > 0) {
        this.currentTurnPlayerId = roundState.turnOrder[roundState.currentTurnIndex] ?? null;
      } else {
        this.currentTurnPlayerId = null;
      }

      this.syncLastPlayedFromRoundState();

      await this.syncPendingAttackEffects();

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

    if (rs.pendingAttack) {
      if (rs.pendingAttackToPlayerId === meId) {
        this.viewState = 'drinking';
      } else {
        this.viewState = 'waiting';
      }
      return;
    }

    const currentTurnId = rs.turnOrder[rs.currentTurnIndex] ?? null;

    if (currentTurnId === meId) {
      this.viewState = 'playing';
    } else {
      this.viewState = 'waiting';
    }
  }

  // 🔁 Helper: bygg hånd slik at vi ALLTID har 1 av hver type i rekkefølge:
  // [DEFENCE, CURSE, ATTACK]
  private buildHandWithOneOfEach(remaining: Card[] = []) {
    const types: Array<Card['type']> = ['defence', 'curse', 'attack'];
    const newHand: Card[] = [];

    for (const type of types) {
      const idx = remaining.findIndex((c) => c.type === type);
      if (idx !== -1) {
        newHand.push(remaining[idx]);
      } else {
        newHand.push(this.cards.drawRandom(type));
      }
    }

    this.hand = newHand;
    // default-markér siste (attack)
    this.selectedIndex = this.hand.length > 0 ? this.hand.length - 1 : null;
    console.log('Ny hånd (1 av hver type):', this.hand);
  }

  // 🃏 Første gang vi deler ut
  private dealInitialHand() {
    this.buildHandWithOneOfEach();
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

  async onPlaySelectedCard() {
    const card = this.selectedCard;
    const me = this.me;
    const sessionId = this.sessionId;

    if (!card || !me || !sessionId) {
      return;
    }

    try {
      if (card.type === 'defence') {
        await this.gameSession.playDefenceCard(sessionId, me.id, card.id);
        await this.gameSession.advanceTurn(sessionId);

        // 🃏 Etter spill: erstatt brukt kort, beholde 1 av hver type
        this.removePlayedCardAndDrawNew();
        return;
      }

      if (card.type === 'attack' || card.type === 'curse') {
        const candidates = this.players.filter((p) => p.id !== me.id && p.lives > 0);

        if (!candidates.length) {
          console.warn('Ingen gyldige targets å velge.');
          return;
        }

        this.selectingTarget = true;
        this.targetCandidates = candidates;
        this.pendingCardToPlay = card;
        this.selectedTargetId = candidates[0].id;
        return;
      }
    } catch (e) {
      console.error('Feil ved spilling av kort:', e);
    }
  }

  // 🃏 Ny logikk: behold 1 DEFENCE, 1 CURSE, 1 ATTACK – erstatt kun typen som ble spilt
  private removePlayedCardAndDrawNew() {
    if (this.selectedIndex != null) {
      const remaining = this.hand.filter((_, i) => i !== this.selectedIndex);
      // Bygg opp hånda på nytt med 1 av hver type
      this.buildHandWithOneOfEach(remaining);
    } else {
      // fallback – sørg for at hånda fortsatt er "1 av hver"
      this.buildHandWithOneOfEach(this.hand);
    }

    // reset target-state
    this.selectingTarget = false;
    this.targetCandidates = [];
    this.pendingCardToPlay = null;
    this.selectedTargetId = null;
  }

  async onConfirmDrank() {
    const me = this.me;
    const sessionId = this.sessionId;

    if (!me || !sessionId) return;

    try {
      const total = this.pendingAttackTotalDrinks ?? this.pendingAttackCard?.drinkAmount ?? 0;

      const effectIdsToDelete = [...this.usedEffectIds];

      await this.gameSession.resolveAttackClientSide(sessionId, me.id, total, effectIdsToDelete);

      this.usedEffectIds = [];
    } catch (e) {
      console.error('Feil ved resolveAttackClientSide:', e);
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
        // turn flyttes når target trykker "Jeg har drukket"
      } else if (card.type === 'curse') {
        await this.gameSession.playCurseCard(sessionId, me.id, targetId, card.id);
        await this.gameSession.advanceTurn(sessionId);
      }

      // Erstatt brukt kort, behold 1 av hver type
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

  private markEffectUsedForCard(card: Card, effectType: 'curse' | 'defence') {
    if (!this.pendingAttackEffects?.length) return;

    const effect = this.pendingAttackEffects.find(
      (e) =>
        e.cardId === card.id && e.effectType === effectType && !this.usedEffectIds.includes(e.id)
    );

    if (effect) {
      this.usedEffectIds.push(effect.id);
    }
  }

  private async syncPendingAttackEffects() {
    const rs = this.roundState;
    const sessionId = this.sessionId;

    if (
      !rs ||
      !sessionId ||
      !rs.pendingAttack ||
      !rs.pendingAttackToPlayerId ||
      !rs.pendingAttackCardId
    ) {
      this.pendingAttackCard = null;
      this.pendingAttackEffects = [];
      this.attackSequenceCards = [];
      this.pendingAttackTotalDrinks = null;
      this.pendingAttackTarget = null;
      return;
    }

    this.pendingAttackTarget =
      this.players.find((p) => p.id === rs.pendingAttackToPlayerId) ?? null;

    try {
      this.pendingAttackEffects = await this.gameSession.getPlayerEffectsForSession(
        sessionId,
        rs.pendingAttackToPlayerId
      );
    } catch (e) {
      console.error('Feil ved henting av pendingAttackEffects:', e);
      this.pendingAttackEffects = [];
    }

    try {
      this.pendingAttackCard = this.cards.getCardById(rs.pendingAttackCardId);
    } catch {
      this.pendingAttackCard = null;
    }

    if (!this.pendingAttackCard) {
      this.attackSequenceCards = [];
      this.pendingAttackTotalDrinks = null;
      return;
    }

    const curseCards: Card[] = this.pendingAttackEffects
      .filter((e) => e.effectType === 'curse')
      .map((e) => this.cards.getCardById(e.cardId))
      .filter((c): c is Card => !!c);

    const defenceCards: Card[] = this.pendingAttackEffects
      .filter((e) => e.effectType === 'defence')
      .map((e) => this.cards.getCardById(e.cardId))
      .filter((c): c is Card => !!c);

    this.attackSequenceCards = [this.pendingAttackCard, ...curseCards, ...defenceCards];

    let total = 0;
    let baseSet = false;
    let skipRemainingEffects = false;

    for (const card of this.attackSequenceCards) {
      if (skipRemainingEffects && card.type !== 'attack') {
        continue;
      }

      switch (card.type) {
        case 'attack': {
          let localBaseSet = false;

          if (!card.passive || card.passive.length === 0) {
            total = card.drinkAmount;
            baseSet = true;
            localBaseSet = true;
          } else {
            for (const passive of card.passive) {
              switch (passive) {
                case 'none':
                  total = card.drinkAmount;
                  baseSet = true;
                  localBaseSet = true;
                  break;

                case 'random':
                  total = card.drinkAmount;
                  baseSet = true;
                  localBaseSet = true;
                  skipRemainingEffects = true;
                  break;

                default:
                  break;
              }
            }

            if (!localBaseSet) {
              total = card.drinkAmount;
              baseSet = true;
            }
          }
          break;
        }

        case 'curse': {
          if (!baseSet) break;

          if (!card.passive || card.passive.length === 0) {
          } else {
            let usedEffect = false;

            for (const passive of card.passive) {
              switch (passive) {
                case 'increase':
                  total += card.drinkAmount;
                  usedEffect = true;
                  break;

                case 'double':
                  total *= 2;
                  usedEffect = true;
                  break;

                case 'half':
                  total = Math.ceil(total / 2);
                  usedEffect = true;
                  break;

                default:
                  break;
              }
            }

            if (usedEffect) {
              this.markEffectUsedForCard(card, 'curse');
            }
          }
          break;
        }

        case 'defence': {
          if (!baseSet) break;

          if (!card.passive || card.passive.length === 0) {
          } else {
            let usedEffect = false;

            for (const passive of card.passive) {
              switch (passive) {
                case 'shield':
                  total = 0;
                  usedEffect = true;
                  break;

                case 'reduce':
                  total = Math.max(0, total - card.drinkAmount);
                  usedEffect = true;
                  break;

                case 'half':
                  total = Math.ceil(total / 2);
                  usedEffect = true;
                  break;

                case 'reflect':
                  total = 0;
                  usedEffect = true;
                  break;

                default:
                  break;
              }
            }

            if (usedEffect) {
              this.markEffectUsedForCard(card, 'defence');
            }
          }
          break;
        }
      }
    }

    if (total < 0) total = 0;
    this.pendingAttackTotalDrinks = total;
  }

  getEffect(card: Card): string {
    return card.type.toUpperCase();
  }

  getCardPassive(card: Card): string {
    if (!card.passive || !card.passive.length) {
      return 'none';
    }
    return card.passive.join(', ');
  }

  getAttackTotalBreakdown(): string {
    if (!this.pendingAttackCard) {
      return '';
    }

    const base = this.pendingAttackCard.drinkAmount;
    const total = this.pendingAttackTotalDrinks ?? base;

    const baseStr = `${base} slurk${base === 1 ? '' : 'er'}`;
    const totalStr = `${total} slurk${total === 1 ? '' : 'er'}`;

    if (total === base) {
      return `Base: ${baseStr} (ingen effekter endret antallet).`;
    }

    return `Base: ${baseStr} → Totalt: ${totalStr} etter curse/defence-effekter.`;
  }

  private readonly cardImgBase = '/assets/cards';

  getCardImageSrc(card: any): string {
    return `${this.cardImgBase}/${card.id}.png`; // senere
  }

  onCardImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img.src.endsWith('/default.png')) return;
    img.src = `${this.cardImgBase}/default.png`;
  }

  getTitleSizeClass(title: string): string {
    if (!title) return 'title-normal';

    const t = title.trim();

    // ord = sekvenser uten mellomrom (så "Skolegangster" blir ett ord)
    const words = t.split(/\s+/).filter(Boolean);

    const longestWordLen = words.length ? Math.max(...words.map((w) => w.length)) : 0;

    // total lengde inkl. symboler/punktum osv (men uten mellomrom)
    const totalNoSpaces = t.replace(/\s+/g, '').length;

    // Regler:
    // - veldig lange enkeltord (>= 14) => XS
    // - lange enkeltord (>= 11) => SM
    // - eller: veldig lang tittel totalt => SM/XS
    if (longestWordLen >= 14 || totalNoSpaces >= 28) return 'title-xs';
    if (longestWordLen >= 11 || totalNoSpaces >= 20) return 'title-sm';

    return 'title-normal';
  }
}
