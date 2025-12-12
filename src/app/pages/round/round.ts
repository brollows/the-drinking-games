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

type AttackAnimState = 'idle' | 'running' | 'done';

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

  effectRevealCount = 0; // hvor mange effect-kort som er synlige
  displayPendingTotal = 0; // total som vises nå (oppdateres per steg)
  private stepTotals: number[] = []; // total per steg (index matcher attackSequenceCards)

  private attackAnimTimer: any = null;
  private currentAttackKey: string | null = null;

  private me: Player | null = null;
  private pollingInterval: any = null;

  // ✅ new: progress + random “pile”
  expectedEffectCount = 0;
  effectDotArray: null[] = [];
  private effectRotations: string[] = [];
  private effectFrom: string[] = [];

  private animState: AttackAnimState = 'idle';

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
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.stopAttackAnimation();
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

      // ✅ start animasjon etter viewState
      this.startAttackAnimationIfNeeded();

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
    this.selectedIndex = this.hand.length > 0 ? this.hand.length - 1 : null;
    console.log('Ny hånd (1 av hver type):', this.hand);
  }

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

    if (!card || !me || !sessionId) return;

    try {
      if (card.type === 'defence') {
        await this.gameSession.playDefenceCard(sessionId, me.id, card.id);
        await this.gameSession.advanceTurn(sessionId);

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

  private removePlayedCardAndDrawNew() {
    if (this.selectedIndex != null) {
      const remaining = this.hand.filter((_, i) => i !== this.selectedIndex);
      this.buildHandWithOneOfEach(remaining);
    } else {
      this.buildHandWithOneOfEach(this.hand);
    }

    this.selectingTarget = false;
    this.targetCandidates = [];
    this.pendingCardToPlay = null;
    this.selectedTargetId = null;
  }

  async onConfirmDrank() {
    const me = this.me;
    const sessionId = this.sessionId;

    if (!me || !sessionId) return;

    // ✅ hard stop: ikke tillat før animasjonen er ferdig
    if (!this.canConfirmDrank) return;

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

    if (!sessionId || !me || !card || !targetId) return;

    try {
      if (card.type === 'attack') {
        await this.gameSession.playAttackCard(sessionId, me.id, targetId, card.id);
      } else if (card.type === 'curse') {
        await this.gameSession.playCurseCard(sessionId, me.id, targetId, card.id);
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

      // reset anim state
      this.animState = 'idle';
      this.currentAttackKey = null;
      this.effectRevealCount = 0;
      this.displayPendingTotal = 0;
      this.stepTotals = [];
      this.expectedEffectCount = 0;
      this.effectDotArray = [];
      this.effectRotations = [];
      this.effectFrom = [];
      this.stopAttackAnimation();

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

    const cursePriority: Record<string, number> = { increase: 0, double: 1 };
    const defencePriority: Record<string, number> = { reflect: 0, shield: 1, reduce: 2, half: 3 };

    const getPriority = (card: Card, map: Record<string, number>) => {
      const passives = card.passive ?? [];
      let best = Number.POSITIVE_INFINITY;

      for (const p of passives) {
        if (map[p] !== undefined) {
          best = Math.min(best, map[p]);
        }
      }
      return best;
    };

    const sortedCurse = [...curseCards].sort(
      (a, b) => getPriority(a, cursePriority) - getPriority(b, cursePriority)
    );

    const sortedDefence = [...defenceCards].sort(
      (a, b) => getPriority(a, defencePriority) - getPriority(b, defencePriority)
    );

    this.attackSequenceCards = [this.pendingAttackCard, ...sortedCurse, ...sortedDefence];

    // ---------------- EFFECT RESOLUTION ----------------
    let total = 0;
    let baseSet = false;
    let skipRemainingEffects = false;

    for (const card of this.attackSequenceCards) {
      if (skipRemainingEffects && card.type !== 'attack') continue;
      if (baseSet && total === 0) break;

      switch (card.type) {
        case 'attack': {
          const passives = card.passive ?? [];
          total = card.drinkAmount;
          baseSet = true;

          if (passives.includes('random')) {
            skipRemainingEffects = true;
          }
          break;
        }

        case 'curse': {
          if (!baseSet) break;

          let used = false;

          for (const passive of card.passive ?? []) {
            if (passive === 'increase') {
              total += card.drinkAmount;
              used = true;
            }
            if (passive === 'double') {
              total *= 2;
              used = true;
            }
            if (total === 0) break;
          }

          if (used) this.markEffectUsedForCard(card, 'curse');
          break;
        }

        case 'defence': {
          if (!baseSet) break;

          let used = false;
          let reflectTriggered = false;

          for (const passive of card.passive ?? []) {
            if (passive === 'reflect') {
              total = 0;
              used = true;
              reflectTriggered = true;
            }
            if (passive === 'shield') {
              total = 0;
              used = true;
            }
            if (passive === 'reduce') {
              total = Math.max(0, total - card.drinkAmount);
              used = true;
            }
            if (passive === 'half') {
              total = Math.ceil(total / 2);
              used = true;
            }
            if (reflectTriggered || total === 0) break;
          }

          if (used) this.markEffectUsedForCard(card, 'defence');
          break;
        }
      }
    }

    this.pendingAttackTotalDrinks = Math.max(0, total);
  }

  private readonly cardImgBase = '/assets/cards';

  getCardImageSrc(card: any): string {
    return `${this.cardImgBase}/${card.id}.png`;
  }

  onCardImgError(ev: Event) {
    const img = ev.target as HTMLImageElement;
    if (img.src.endsWith('/default.png')) return;
    img.src = `${this.cardImgBase}/default.png`;
  }

  getTitleSizeClass(title: string): string {
    if (!title) return 'title-normal';

    const t = title.trim();
    const words = t.split(/\s+/).filter(Boolean);
    const longestWordLen = words.length ? Math.max(...words.map((w) => w.length)) : 0;
    const totalNoSpaces = t.replace(/\s+/g, '').length;

    if (longestWordLen >= 14 || totalNoSpaces >= 28) return 'title-xs';
    if (longestWordLen >= 11 || totalNoSpaces >= 20) return 'title-sm';

    return 'title-normal';
  }

  // ✅ use all effects, not slice (so we can stack + animate)
  get allEffectCards(): Card[] {
    return this.attackSequenceCards.slice(1);
  }

  // ✅ button gating
  get canConfirmDrank(): boolean {
    if (this.viewState !== 'drinking') return true;
    if (this.expectedEffectCount <= 0) return true; // ingen effekter, lov å trykke med en gang
    return this.animState === 'done';
  }

  private stopAttackAnimation() {
    if (this.attackAnimTimer) {
      clearTimeout(this.attackAnimTimer);
      this.attackAnimTimer = null;
    }
  }

  private buildAttackKey(rs: RoundState, effects: PlayerEffect[]): string {
    const effectIds = effects
      .map((e) => e.id)
      .sort()
      .join(',');
    return `${rs.pendingAttackCardId}|${rs.pendingAttackToPlayerId}|${effectIds}`;
  }

  private computeStepTotals(sequence: Card[]): number[] {
    let total = 0;
    let baseSet = false;
    let skipRemainingEffects = false;
    const totals: number[] = [];

    for (const card of sequence) {
      if (skipRemainingEffects && card.type !== 'attack') {
        totals.push(total);
        continue;
      }

      if (baseSet && total === 0) {
        totals.push(0);
        continue;
      }

      switch (card.type) {
        case 'attack': {
          const passives = card.passive ?? [];
          total = card.drinkAmount;
          baseSet = true;

          if (passives.includes('random')) {
            skipRemainingEffects = true;
          }
          break;
        }

        case 'curse': {
          if (!baseSet) break;
          for (const p of card.passive ?? []) {
            if (p === 'increase') total += card.drinkAmount;
            if (p === 'double') total *= 2;
            if (total === 0) break;
          }
          break;
        }

        case 'defence': {
          if (!baseSet) break;
          let reflect = false;

          for (const p of card.passive ?? []) {
            if (p === 'reflect') {
              total = 0;
              reflect = true;
            }
            if (p === 'shield') total = 0;
            if (p === 'reduce') total = Math.max(0, total - card.drinkAmount);
            if (p === 'half') total = Math.ceil(total / 2);
            if (reflect || total === 0) break;
          }
          break;
        }
      }

      totals.push(Math.max(0, total));
    }

    return totals;
  }

  private initEffectVisuals(effectsCount: number) {
    this.expectedEffectCount = effectsCount;
    this.effectDotArray = Array.from({ length: effectsCount }, () => null);

    // random rotasjon + side per effect
    this.effectRotations = [];
    this.effectFrom = [];

    for (let i = 0; i < effectsCount; i++) {
      const rot = Math.floor(Math.random() * 51) - 25; // -25..25
      this.effectRotations.push(`${rot}deg`);

      const from = Math.random() < 0.5 ? '-160px' : '160px';
      this.effectFrom.push(from);
    }
  }

  getEffectRotation(i: number): string {
    return this.effectRotations[i] ?? '0deg';
  }

  getEffectFrom(i: number): string {
    return this.effectFrom[i] ?? '160px';
  }

  private startAttackAnimationIfNeeded() {
    const rs = this.roundState;

    if (!rs || !rs.pendingAttack) {
      this.stopAttackAnimation();
      this.currentAttackKey = null;
      this.animState = 'idle';
      this.effectRevealCount = 0;
      this.displayPendingTotal = 0;
      this.stepTotals = [];
      this.expectedEffectCount = 0;
      this.effectDotArray = [];
      this.effectRotations = [];
      this.effectFrom = [];
      return;
    }

    const key = this.buildAttackKey(rs, this.pendingAttackEffects);

    // ✅ viktig: IKKE restart hvis samme key (selv om timer==null)
    if (this.currentAttackKey === key) {
      return;
    }

    // ny attack/effect-sett -> reset og start
    this.currentAttackKey = key;
    this.stopAttackAnimation();

    this.animState = 'running';

    this.stepTotals = this.computeStepTotals(this.attackSequenceCards);

    const base = this.pendingAttackCard?.drinkAmount ?? 0;

    const effectsCount = Math.max(0, this.attackSequenceCards.length - 1);
    this.initEffectVisuals(effectsCount);

    // start: 0 effects synlig, total = base (stepTotals[0])
    this.effectRevealCount = 0;
    this.displayPendingTotal = this.stepTotals.length ? this.stepTotals[0] : base;

    // ingen effekter -> ferdig med en gang
    if (effectsCount <= 0) {
      this.animState = 'done';
      return;
    }

    const tick = () => {
      this.effectRevealCount = Math.min(effectsCount, this.effectRevealCount + 1);

      // total etter "attack + N effects" ligger på index = N (attack er index 0)
      const idx = Math.min(this.effectRevealCount, this.stepTotals.length - 1);
      this.displayPendingTotal = this.stepTotals[idx] ?? this.displayPendingTotal;

      // ferdig?
      if (this.effectRevealCount >= effectsCount || this.displayPendingTotal === 0) {
        this.attackAnimTimer = null;
        this.animState = 'done';
        return;
      }

      this.attackAnimTimer = setTimeout(tick, 5000);
    };

    // ✅ behold 5 sek før første effect
    this.attackAnimTimer = setTimeout(tick, 5000);
  }

  getAttackTotalBreakdownAnimated(): string {
    if (!this.pendingAttackCard) return '';

    const base = this.pendingAttackCard.drinkAmount;
    const total = this.displayPendingTotal || base;

    const baseStr = `${base} slurk${base === 1 ? '' : 'er'}`;
    const totalStr = `${total} slurk${total === 1 ? '' : 'er'}`;

    if (total === base) return `Base: ${baseStr}.`;
    return `Base: ${baseStr} → Nå: ${totalStr}.`;
  }
}
