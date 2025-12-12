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
type RandomPhase = 'idle' | 'countdown' | 'spinning' | 'done';

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

  effectRevealCount = 0;
  displayPendingTotal = 0;
  private stepTotals: number[] = [];

  private attackAnimTimer: any = null;
  private currentAttackKey: string | null = null;

  private me: Player | null = null;
  private pollingInterval: any = null;

  expectedEffectCount = 0;
  effectDotArray: null[] = [];
  private effectRotations: string[] = [];
  private effectFrom: string[] = [];

  private animState: AttackAnimState = 'idle';

  // ✅ per-button lock (ikke global)
  private btnLocks: Record<string, number> = {};

  // ✅ RANDOM overlay + wheel (tivoli)
  randomOverlayVisible = false;
  randomOverlayHiding = false;
  randomPhase: RandomPhase = 'idle';
  randomCountdown = 5;

  randomWheelWinner: Player | null = null;

  wheelReelItems: Player[] = [];
  wheelTransform = 'translateY(0px)';
  wheelTransition = 'none';

  private randomKey: string | null = null;
  private randomCountdownTimer: any = null;
  private randomSpinTimer: any = null;
  private randomFadeTimer: any = null;

  // wheel layout constants
  private readonly WHEEL_ITEM_H = 42; // må matche CSS-ish høyde på item
  private readonly WHEEL_VISIBLE_CENTER_OFFSET = 2; // marker er midt i window, vi aligner ca. midt på item

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
    this.stopRandomTimers();
  }

  // =========================
  // ✅ per-button lock helpers
  // =========================
  isBtnLocked(key: string): boolean {
    const until = this.btnLocks[key] ?? 0;
    return Date.now() < until;
  }

  private lockBtn(key: string, ms: number = 1000) {
    this.btnLocks[key] = Date.now() + ms;
  }

  private isCardRandom(card: Card | null | undefined): boolean {
    return !!card && (card.passive ?? []).includes('random');
  }

  get isRandomSelected(): boolean {
    return this.isCardRandom(this.selectedCard);
  }

  get isRandomPendingAttack(): boolean {
    return this.isCardRandom(this.pendingAttackCard);
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

      await this.refreshSkipIndicators();

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

      await this.maybeConsumeSkipTurn();

      if (this.viewState !== 'lost' && this.viewState !== 'finished') {
        this.updateViewStateFromRoundState();
      }

      // ✅ start random overlay timeline (countdown -> spin -> fade -> then allow drinking UI)
      this.startRandomSequenceIfNeeded();

      // ✅ start attack effects animasjon (ikke for random)
      this.startAttackAnimationIfNeeded();

      try {
        this.cdr.detectChanges();
      } catch {
        // ignorer hvis view er destroyed
      }
    } catch (e: any) {
      if (e?.message === '__SKIP_CONSUMED__') return;
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

    // ✅ hvis random overlay kjører, hold alle i "waiting" visuelt til overlay er done
    if (rs.pendingAttack && this.isRandomPendingAttack && this.randomPhase !== 'done') {
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

    // ✅ hvis random-kort er selected, sørg for at target-lista ikke henger igjen
    if (this.isRandomSelected) {
      this.selectingTarget = false;
      this.targetCandidates = [];
      this.pendingCardToPlay = null;
      this.selectedTargetId = null;
    }
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
    if (this.isBtnLocked('playSelected')) return;
    this.lockBtn('playSelected', 1000);

    const card = this.selectedCard;
    const me = this.me;
    const sessionId = this.sessionId;

    if (!card || !me || !sessionId) return;

    try {
      // ✅ DEFENCE: effect på deg, så turn advances med en gang
      if (card.type === 'defence') {
        await this.gameSession.playDefenceCard(sessionId, me.id, card.id);
        await this.gameSession.advanceTurn(sessionId);
        this.removePlayedCardAndDrawNew();
        return;
      }

      // ✅ ATTACK random: velg target og skriv til round_state (winner blir synced for alle via pending_attack_to_player_id)
      if (card.type === 'attack' && this.isCardRandom(card)) {
        const alive = this.players.filter((p) => p.lives > 0);
        if (!alive.length) return;

        const idx = Math.floor(Math.random() * alive.length);
        const target = alive[idx];

        await this.gameSession.playAttackCard(sessionId, me.id, target.id, card.id);

        // visuelt: gå til waiting, overlay tar over
        this.viewState = 'waiting';

        this.removePlayedCardAndDrawNew();
        return;
      }

      // ✅ normal ATTACK / CURSE: vis target-liste
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
    if (this.isBtnLocked('confirmDrank')) return;
    this.lockBtn('confirmDrank', 1000);

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
    // ✅ IKKE lock her – du vil kunne trykke raskt mellom spillere
    this.selectedTargetId = playerId;
  }

  async onConfirmTargetSelection() {
    if (this.isBtnLocked('confirmTarget')) return;
    this.lockBtn('confirmTarget', 1000);

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

      // visuelt: gå til waiting, polling tar resten
      this.viewState = 'waiting';

      this.removePlayedCardAndDrawNew();
    } catch (e) {
      console.error('Feil ved bekreftelse av target:', e);
    }
  }

  onCancelTargetSelection() {
    if (this.isBtnLocked('cancelTarget')) return;
    this.lockBtn('cancelTarget', 1000);

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

      // reset random overlay
      this.resetRandomOverlay();

      return;
    }

    this.pendingAttackTarget =
      this.players.find((p) => p.id === rs.pendingAttackToPlayerId) ?? null;

    // hent pending attack card
    try {
      this.pendingAttackCard = this.cards.getCardById(rs.pendingAttackCardId);
    } catch {
      this.pendingAttackCard = null;
    }

    if (!this.pendingAttackCard) {
      this.pendingAttackEffects = [];
      this.attackSequenceCards = [];
      this.pendingAttackTotalDrinks = null;
      return;
    }

    // ✅ RANDOM ATTACK: ingen effekter
    if (this.isCardRandom(this.pendingAttackCard)) {
      this.pendingAttackEffects = [];
      this.attackSequenceCards = [this.pendingAttackCard];
      this.pendingAttackTotalDrinks = Math.max(0, this.pendingAttackCard.drinkAmount);

      this.usedEffectIds = [];
      this.expectedEffectCount = 0;
      this.effectDotArray = [];
      this.effectRevealCount = 0;
      this.displayPendingTotal = this.pendingAttackCard.drinkAmount;

      return;
    }

    // ellers: hent effekter på target
    try {
      this.pendingAttackEffects = await this.gameSession.getPlayerEffectsForSession(
        sessionId,
        rs.pendingAttackToPlayerId
      );
    } catch (e) {
      console.error('Feil ved henting av pendingAttackEffects:', e);
      this.pendingAttackEffects = [];
    }

    const curseCards: Card[] = this.pendingAttackEffects
      .filter((e) => e.effectType === 'curse')
      .map((e) => this.cards.getCardById(e.cardId))
      .filter((c): c is Card => !!c)
      .filter((c) => !(c.passive ?? []).includes('skip')); // skip er ikke drinking-effect

    const defenceCards: Card[] = this.pendingAttackEffects
      .filter((e) => e.effectType === 'defence')
      .map((e) => this.cards.getCardById(e.cardId))
      .filter((c): c is Card => !!c);

    const cursePriority: Record<string, number> = { increase: 0, double: 1 };
    const defencePriority: Record<string, number> = {
      reflect: 0,
      shield: 1,
      reduce: 2,
      half: 3,
    };

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

    for (const card of this.attackSequenceCards) {
      if (baseSet && total === 0) break;

      switch (card.type) {
        case 'attack': {
          total = card.drinkAmount;
          baseSet = true;
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

  get allEffectCards(): Card[] {
    const effects = this.attackSequenceCards.slice(1);
    return effects.slice(0, this.expectedEffectCount);
  }

  get canConfirmDrank(): boolean {
    if (this.viewState !== 'drinking') return true;
    if (this.expectedEffectCount <= 0) return true;
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
    const totals: number[] = [];

    for (const card of sequence) {
      if (baseSet && total === 0) {
        totals.push(0);
        continue;
      }

      switch (card.type) {
        case 'attack': {
          total = card.drinkAmount;
          baseSet = true;
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

    this.effectRotations = [];
    this.effectFrom = [];

    for (let i = 0; i < effectsCount; i++) {
      const rot = Math.floor(Math.random() * 51) - 25; // -25..25
      this.effectRotations.push(`${rot}deg`);

      const from = Math.random() < 0.5 ? '-110px' : '110px';
      this.effectFrom.push(from);
    }
  }

  getEffectRotation(i: number): string {
    return this.effectRotations[i] ?? '0deg';
  }

  getEffectFrom(i: number): string {
    return this.effectFrom[i] ?? '110px';
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

    // ✅ random attack: ingen effects
    if (this.isRandomPendingAttack) {
      this.stopAttackAnimation();
      this.animState = 'done';
      this.expectedEffectCount = 0;
      this.effectDotArray = [];
      this.effectRevealCount = 0;
      this.displayPendingTotal = this.pendingAttackCard?.drinkAmount ?? this.displayPendingTotal;
      return;
    }

    const key = this.buildAttackKey(rs, this.pendingAttackEffects);
    if (this.currentAttackKey === key) return;

    this.currentAttackKey = key;
    this.stopAttackAnimation();

    this.animState = 'running';

    this.stepTotals = this.computeStepTotals(this.attackSequenceCards);

    const base = this.pendingAttackCard?.drinkAmount ?? 0;
    const effectsCount = Math.max(0, this.stepTotals.length - 1);

    this.initEffectVisuals(effectsCount);
    try {
      this.cdr.detectChanges();
    } catch {}

    this.effectRevealCount = 0;
    this.displayPendingTotal = this.stepTotals.length ? this.stepTotals[0] : base;

    if (effectsCount <= 0) {
      this.animState = 'done';
      return;
    }

    const tick = () => {
      this.effectRevealCount = Math.min(effectsCount, this.effectRevealCount + 1);

      const idx = Math.min(this.effectRevealCount, this.stepTotals.length - 1);
      this.displayPendingTotal = this.stepTotals[idx] ?? this.displayPendingTotal;

      if (this.effectRevealCount >= effectsCount || this.displayPendingTotal === 0) {
        this.attackAnimTimer = null;
        this.animState = 'done';
        return;
      }

      this.attackAnimTimer = setTimeout(tick, 2500);
    };

    this.attackAnimTimer = setTimeout(tick, 2000);
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

  private async maybeConsumeSkipTurn() {
    const rs = this.roundState;
    const me = this.me;
    const sessionId = this.sessionId;

    if (!rs || !me || !sessionId) return;

    const currentTurnId = rs.turnOrder[rs.currentTurnIndex] ?? null;
    if (rs.pendingAttack) return;
    if (currentTurnId !== me.id) return;

    let effects: PlayerEffect[] = [];
    try {
      effects = await this.gameSession.getPlayerEffectsForSession(sessionId, me.id);
    } catch {
      return;
    }

    const skipEffects = effects.filter((e) => e.effectType === 'curse');
    const skipIds: string[] = [];

    for (const e of skipEffects) {
      let card: Card | null = null;
      try {
        card = this.cards.getCardById(e.cardId);
      } catch {}

      if (card && (card.passive ?? []).includes('skip')) {
        skipIds.push(e.id);
      }
    }

    if (!skipIds.length) return;

    await this.gameSession.removePlayerEffects(sessionId, skipIds);
    await this.gameSession.advanceTurn(sessionId);

    this.viewState = 'waiting';
    throw new Error('__SKIP_CONSUMED__');
  }

  playerHasSkip: Record<string, boolean> = {};
  private lastSkipScanAt = 0;

  private async refreshSkipIndicators() {
    const sessionId = this.sessionId;
    if (!sessionId) return;

    const now = Date.now();
    if (now - this.lastSkipScanAt < 2500) return;
    this.lastSkipScanAt = now;

    const map: Record<string, boolean> = {};
    await Promise.all(
      this.players.map(async (p) => {
        try {
          const effects = await this.gameSession.getPlayerEffectsForSession(sessionId, p.id);
          map[p.id] = effects.some((e) => {
            if (e.effectType !== 'curse') return false;
            try {
              const c = this.cards.getCardById(e.cardId);
              return (c.passive ?? []).includes('skip');
            } catch {
              return false;
            }
          });
        } catch {
          map[p.id] = false;
        }
      })
    );

    this.playerHasSkip = map;
  }

  // =========================
  // ✅ RANDOM OVERLAY SEQUENCE
  // =========================
  private resetRandomOverlay() {
    this.stopRandomTimers();
    this.randomOverlayVisible = false;
    this.randomOverlayHiding = false;
    this.randomPhase = 'idle';
    this.randomCountdown = 5;
    this.randomWheelWinner = null;
    this.wheelReelItems = [];
    this.wheelTransform = 'translateY(0px)';
    this.wheelTransition = 'none';
    this.randomKey = null;
  }

  private stopRandomTimers() {
    if (this.randomCountdownTimer) clearInterval(this.randomCountdownTimer);
    if (this.randomSpinTimer) clearTimeout(this.randomSpinTimer);
    if (this.randomFadeTimer) clearTimeout(this.randomFadeTimer);
    this.randomCountdownTimer = null;
    this.randomSpinTimer = null;
    this.randomFadeTimer = null;
  }

  private startRandomSequenceIfNeeded() {
    const rs = this.roundState;

    if (!rs || !rs.pendingAttack || !this.isRandomPendingAttack) {
      // hvis angrep ikke er random/pending -> reset
      if (this.randomOverlayVisible || this.randomPhase !== 'idle') {
        this.resetRandomOverlay();
      }
      return;
    }

    // key basert på hvem som spiller og hvem som er winner (winner er synced via DB)
    const key = `${rs.pendingAttackCardId}|${rs.pendingAttackFromPlayerId}|${rs.pendingAttackToPlayerId}`;
    if (this.randomKey === key) return; // allerede startet

    this.randomKey = key;

    // bygg “alive list” (visuelt)
    const alive = this.players.filter((p) => p.lives > 0);
    const baseList = alive.length ? alive : [...this.players];

    // winner (synced)
    this.randomWheelWinner = this.pendingAttackTarget ?? null;

    // overlay inn
    this.randomOverlayVisible = true;
    this.randomOverlayHiding = false;
    this.randomPhase = 'countdown';
    this.randomCountdown = 5;

    // init reel items (mange repetisjoner så vi kan spinne langt)
    this.buildWheelReel(baseList, this.randomWheelWinner);

    // hold wheel i startposisjon under countdown
    this.wheelTransition = 'none';
    this.wheelTransform = 'translateY(0px)';

    // countdown 5 sek
    this.stopRandomTimers();
    this.randomCountdownTimer = setInterval(() => {
      this.randomCountdown = Math.max(0, this.randomCountdown - 1);
      try {
        this.cdr.detectChanges();
      } catch {}

      if (this.randomCountdown <= 0) {
        if (this.randomCountdownTimer) clearInterval(this.randomCountdownTimer);
        this.randomCountdownTimer = null;

        // start spin
        this.startWheelSpinToWinner();
      }
    }, 1000);

    // forcing waiting-view under overlay
    this.updateViewStateFromRoundState();
  }

  private buildWheelReel(baseList: Player[], winner: Player | null) {
    // Buffer før/etter så vi aldri havner i “tomt område”
    const bufferCycles = 6; // ekstra runder før og etter
    const mainCycles = 24; // selve “massen” vi spinner gjennom
    const totalCycles = bufferCycles + mainCycles + bufferCycles;

    const reel: Player[] = [];

    // bygg opp med mange repetisjoner
    for (let i = 0; i < totalCycles; i++) {
      reel.push(...baseList);
    }

    // winner (fallback)
    const winnerId = winner?.id ?? baseList[0]?.id ?? null;

    let winnerIdxInBase = baseList.findIndex((p) => p.id === winnerId);
    if (winnerIdxInBase < 0) winnerIdxInBase = 0;

    // land i en av de siste main-cycles, men med buffer etter (så vi ikke “går tomme”)
    const landingCycle = bufferCycles + (mainCycles - 3); // <- ikke helt på slutten
    const landingBase = landingCycle * baseList.length;

    // liten deterministisk “nudge” så det ikke ser likt ut hver gang
    const deterministicNudge = (winnerIdxInBase * 7 + baseList.length * 3) % baseList.length;
    const landingIndex = landingBase + ((winnerIdxInBase + deterministicNudge) % baseList.length);

    this.wheelReelItems = reel;

    // start litt “inni” listen (midt i buffer) så vi har plenty items over marker også
    const startIndex = bufferCycles * baseList.length;
    // @ts-ignore
    this._wheelStartIndex = startIndex;
    // @ts-ignore
    this._wheelLandingIndex = landingIndex;

    // sett startposisjon i “countdown”
    const startY = startIndex * this.WHEEL_ITEM_H;
    this.wheelTransition = 'none';
    this.wheelTransform = `translateY(-${startY}px)`;

    try {
      this.cdr.detectChanges();
    } catch {}
  }

  // @ts-ignore - internal landing index
  private _wheelLandingIndex: number = 0;
  private _wheelStartIndex: number = 0;

  private startWheelSpinToWinner() {
    if (!this.randomOverlayVisible) return;

    this.randomPhase = 'spinning';

    // vi vil at strip’en flytter seg opp (negativ Y) til landingIndex
    // marker ligger i midten av window. vi aligner approx midt på item.
    const landingIndex = this._wheelLandingIndex ?? 0;
    const startIndex = this._wheelStartIndex ?? 0;

    // marker ligger midt i vinduet – litt center-justering
    const centerAdjust = this.WHEEL_ITEM_H / this.WHEEL_VISIBLE_CENTER_OFFSET;

    // startpos (samme som countdown satte)
    const startY = startIndex * this.WHEEL_ITEM_H;
    this.wheelTransition = 'none';
    this.wheelTransform = `translateY(-${startY}px)`;

    // sluttpos
    const finalY = landingIndex * this.WHEEL_ITEM_H + centerAdjust;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.wheelTransition = 'transform 10s cubic-bezier(0.08, 0.85, 0.12, 1)';
        this.wheelTransform = `translateY(-${finalY}px)`;
        try {
          this.cdr.detectChanges();
        } catch {}
      });
    });

    // after 10s: done + fade out 0.5s
    this.randomSpinTimer = setTimeout(() => {
      this.randomSpinTimer = null;
      this.randomPhase = 'done';

      // fade out (0.5s)
      this.randomOverlayHiding = true;

      this.randomFadeTimer = setTimeout(() => {
        this.randomFadeTimer = null;
        this.randomOverlayVisible = false;
        this.randomOverlayHiding = false;

        // ✅ når overlay er ferdig: nå får target gå til drinking view
        this.updateViewStateFromRoundState();

        try {
          this.cdr.detectChanges();
        } catch {}
      }, 500);

      try {
        this.cdr.detectChanges();
      } catch {}
    }, 10000);
  }
}
