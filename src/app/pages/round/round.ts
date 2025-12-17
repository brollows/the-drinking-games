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

  get isGameFinished(): boolean {
    const alive = this.players.filter((p) => (p.lives ?? 0) > 0);
    return this.players.length >= 2 && alive.length <= 1;
  }

  get podiumPlayers(): Player[] {
    const sorted = [...this.players].sort((a, b) => {
      const aAlive = (a.lives ?? 0) > 0;
      const bAlive = (b.lives ?? 0) > 0;

      if (aAlive !== bAlive) return aAlive ? -1 : 1;

      if (aAlive && bAlive) return (b.lives ?? 0) - (a.lives ?? 0);

      const ae = a.eliminatedAt ? new Date(a.eliminatedAt).getTime() : 0;
      const be = b.eliminatedAt ? new Date(b.eliminatedAt).getTime() : 0;
      return be - ae;
    });

    return sorted.slice(0, 3);
  }

  get standingsPlayers(): Player[] {
    return [...this.players].sort((a, b) => {
      const la = a.lives ?? 0;
      const lb = b.lives ?? 0;
      if (lb !== la) return lb - la;
      const n = (a.name ?? '').localeCompare(b.name ?? '');
      if (n !== 0) return n;
      return (a.id ?? '').localeCompare(b.id ?? '');
    });
  }

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

  expectedEffectCount = 0;
  effectDotArray: null[] = [];
  private effectRotations: string[] = [];
  private effectFrom: string[] = [];

  private animState: AttackAnimState = 'idle';

  private btnLocks: Record<string, number> = {};

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

  private readonly WHEEL_ITEM_H = 42;
  private readonly WHEEL_WINDOW_H = 160;

  reflectAvailable = false;
  reflectorPlayer: Player | null = null;
  private reflectEffectIndex: number | null = null;

  get reflectUiReady(): boolean {
    if (!this.reflectAvailable) return false;
    if (this.reflectEffectIndex === null) return false;
    return this.effectRevealCount > this.reflectEffectIndex;
  }

  private unsubPlayers: (() => void) | null = null;
  private unsubRoundState: (() => void) | null = null;

  private safetyResyncTimer: any = null;
  private lastResyncAt = 0;
  private resyncInFlight = false;

  private effectsCache: PlayerEffect[] = [];
  private lastEffectsFetchAt = 0;

  private onVisibilityChange: (() => void) | null = null;

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

    this.me = this.gameSession.currentPlayer ?? null;

    this.dealInitialHand();
    await this.fullResync();

    this.unsubPlayers = this.gameSession.subscribeToPlayers(this.sessionId, () => {
      this.fullResyncThrottled(150);
    });

    this.unsubRoundState = this.gameSession.subscribeToRoundState(this.sessionId, (rs) => {
      this.roundState = rs;
      this.fullResyncThrottled(0);
    });

    this.safetyResyncTimer = setInterval(() => {
      this.fullResyncThrottled(0);
    }, 7000);

    this.startHardSync();

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.fullResyncThrottled(0);
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    if (this.unsubPlayers) this.unsubPlayers();
    if (this.unsubRoundState) this.unsubRoundState();
    if (this.safetyResyncTimer) clearInterval(this.safetyResyncTimer);

    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }

    this.stopAttackAnimation();
    this.stopRandomTimers();

    this.stopHardSync();
  }

  goHome() {
    this.router.navigate(['/']);
  }

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

  get isReflectPendingAttack(): boolean {
    return !!this.roundState?.pendingAttackIsReflect;
  }

  private fullResyncThrottled(minDelayMs: number) {
    const now = Date.now();
    if (now - this.lastResyncAt < minDelayMs) return;

    this.lastResyncAt = now;

    if (this.resyncInFlight) return;
    this.resyncInFlight = true;

    void this.fullResync().finally(() => {
      this.resyncInFlight = false;
    });
  }

  private isMaintenanceLeader(): boolean {
    const me = this.me;
    if (!me) return false;

    const host = this.players.find((p) => p.isHost);
    if (host) return host.id === me.id;

    const alive = this.players.filter((p) => (p.lives ?? 0) > 0);
    const ids = (alive.length ? alive : this.players).map((p) => p.id).sort();
    return ids.length ? ids[0] === me.id : false;
  }

  private async fullResync() {
    if (!this.sessionId) return;

    try {
      const [players, rs] = await Promise.all([
        this.gameSession.getPlayersForSession(this.sessionId),
        this.roundState
          ? Promise.resolve(this.roundState)
          : this.gameSession.getRoundState(this.sessionId),
      ]);

      this.roundState = rs;
      this.players = this.sortPlayersByTurnOrder(players, rs);

      await this.refreshEffectsCacheIfNeeded();
      this.refreshSkipIndicatorsFromCache();

      const meId = this.me?.id ?? null;
      if (meId) {
        const meFromList = this.players.find((p) => p.id === meId) ?? null;
        if (meFromList) {
          this.me = meFromList;
          this.currentLives = meFromList.lives;
        }
      }

      if (this.isGameFinished) {
        this.viewState = 'finished';
      }

      if (this.currentLives !== null && this.currentLives <= 0) {
        if (this.viewState !== 'finished') this.viewState = 'lost';
      }

      if (rs && rs.turnOrder.length > 0 && typeof rs.currentTurnIndex === 'number') {
        this.currentTurnPlayerId = rs.turnOrder[rs.currentTurnIndex] ?? null;
      } else {
        this.currentTurnPlayerId = null;
      }

      // Leader-only repair: sørg for at current_turn_index peker på en eksisterende & levende spiller.
      await this.maybeRepairInvalidTurnPointer();

      this.syncLastPlayedFromRoundState();
      await this.syncPendingAttackEffectsFromCache();

      await this.maybeConsumeSkipTurn();

      if (this.viewState !== 'lost' && this.viewState !== 'finished') {
        this.updateViewStateFromRoundState();
      }

      this.startRandomSequenceIfNeeded();
      this.startAttackAnimationIfNeeded();

      try {
        this.cdr.detectChanges();
      } catch {}
    } catch (e: any) {
      if (e?.message === '__SKIP_CONSUMED__') return;
      console.error('Kunne ikke fullResync i round:', e);
    }
  }

  private async maybeRepairInvalidTurnPointer(): Promise<void> {
    const rs = this.roundState;
    const sessionId = this.sessionId;

    if (!rs || !sessionId) return;
    if (!rs.turnOrder?.length) return;
    if (rs.pendingAttack) return;
    if (this.isGameFinished) return;
    if (!this.isMaintenanceLeader()) return;

    const order = rs.turnOrder;
    const len = order.length;

    const playersById = new Map(this.players.map((p) => [p.id, p] as const));
    const isAlive = (id: string | null | undefined) => {
      if (!id) return false;
      const p = playersById.get(id);
      return !!p && (p.lives ?? 0) > 0;
    };

    let idx = rs.currentTurnIndex;

    // 1) Hvis idx er ugyldig: sett til første levende
    if (typeof idx !== 'number' || idx < 0 || idx >= len) {
      const firstAlive = order.findIndex((id) => isAlive(id));
      const safeIndex = firstAlive >= 0 ? firstAlive : 0;

      await this.gameSession.repairTurnIndex(sessionId, safeIndex);
      this.roundState = await this.gameSession.getRoundState(sessionId);
      return;
    }

    // 2) Hvis currentId mangler i players (left) eller er død: finn neste levende
    const currentId = order[idx] ?? null;
    if (isAlive(currentId)) return;

    let nextAliveIndex = -1;
    for (let i = 1; i <= len; i++) {
      const ni = (idx + i) % len;
      const id = order[ni] ?? null;
      if (isAlive(id)) {
        nextAliveIndex = ni;
        break;
      }
    }

    if (nextAliveIndex >= 0) {
      await this.gameSession.repairTurnIndex(sessionId, nextAliveIndex);
      this.roundState = await this.gameSession.getRoundState(sessionId);
      return;
    }

    // Ingen levende funnet – la det være (finish håndteres av isGameFinished)
  }

  private async refreshEffectsCacheIfNeeded(force: boolean = false) {
    if (!this.sessionId) return;

    const now = Date.now();
    if (!force && now - this.lastEffectsFetchAt < 2500) return;

    this.lastEffectsFetchAt = now;
    try {
      this.effectsCache = await this.gameSession.getAllPlayerEffectsForSession(this.sessionId);
    } catch {
      this.effectsCache = [];
    }
  }

  private getEffectsForPlayerFromCache(playerId: string): PlayerEffect[] {
    return (this.effectsCache ?? []).filter((e) => e.playerId === playerId);
  }

  private syncLastPlayedFromRoundState() {
    const rs = this.roundState;
    if (!rs) {
      this.lastPlayedCard = null;
      this.lastPlayedBy = null;
      this.lastPlayedTarget = null;
      this.reflectorPlayer = null;
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

    if (rs.pendingAttackIsReflect) {
      this.reflectorPlayer = this.players.find((p) => p.id === rs.lastToPlayerId) ?? null;
    } else {
      this.reflectorPlayer = null;
    }
  }

  private updateViewStateFromRoundState() {
    const rs = this.roundState;
    const meId = this.me?.id ?? null;

    if (!rs || !meId) {
      this.viewState = 'waiting';
      return;
    }

    if (rs.pendingAttack && this.isRandomPendingAttack && this.randomPhase !== 'done') {
      this.viewState = 'waiting';
      return;
    }

    if (rs.pendingAttack) {
      this.viewState = rs.pendingAttackToPlayerId === meId ? 'drinking' : 'waiting';
      return;
    }

    const currentTurnId = rs.turnOrder?.[rs.currentTurnIndex] ?? null;
    this.viewState = currentTurnId === meId ? 'playing' : 'waiting';
  }

  private buildHandWithOneOfEach(remaining: Card[] = []) {
    const types: Array<Card['type']> = ['defence', 'curse', 'attack'];
    const newHand: Card[] = [];

    for (const type of types) {
      const idx = remaining.findIndex((c) => c.type === type);
      if (idx !== -1) newHand.push(remaining[idx]);
      else newHand.push(this.cards.drawRandom(type));
    }

    this.hand = newHand;
    this.selectedIndex = this.hand.length > 0 ? this.hand.length - 1 : null;
  }

  private dealInitialHand() {
    this.buildHandWithOneOfEach();
  }

  onSelectCard(index: number) {
    this.selectedIndex = index;

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
    this.lockBtn('playSelected', 2000);

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

      if (card.type === 'attack' && this.isCardRandom(card)) {
        const alive = this.players.filter((p) => (p.lives ?? 0) > 0);
        if (!alive.length) return;

        const idx = Math.floor(Math.random() * alive.length);
        const target = alive[idx];

        await this.gameSession.playAttackCard(sessionId, me.id, target.id, card.id);

        this.viewState = 'waiting';
        this.removePlayedCardAndDrawNew();
        return;
      }

      if (card.type === 'attack' || card.type === 'curse') {
        const candidates = this.players.filter((p) => p.id !== me.id && (p.lives ?? 0) > 0);
        if (!candidates.length) return;

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
    this.buildHandWithOneOfEach([]);

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
    if (!this.canConfirmDrank) return;

    try {
      const total =
        this.roundState?.pendingAttackIsReflect && this.roundState?.pendingAttackFixedTotal != null
          ? this.roundState.pendingAttackFixedTotal
          : this.pendingAttackTotalDrinks ?? this.pendingAttackCard?.drinkAmount ?? 0;

      const effectIdsToDelete = [...this.usedEffectIds];

      await this.gameSession.resolveAttackClientSide(sessionId, me.id, total, effectIdsToDelete);

      this.usedEffectIds = [];
      await this.refreshEffectsCacheIfNeeded(true);
    } catch (e) {
      console.error('Feil ved resolveAttackClientSide:', e);
    }
  }

  async onConfirmReflect() {
    if (this.isBtnLocked('confirmReflect')) return;
    this.lockBtn('confirmReflect', 1000);

    const rs = this.roundState;
    const me = this.me;
    const sessionId = this.sessionId;

    if (!rs || !me || !sessionId) return;
    if (!rs.pendingAttack) return;
    if (!this.reflectUiReady) return;

    try {
      const fixedTotal =
        rs.pendingAttackFixedTotal != null
          ? Math.max(0, this.pendingAttackTotalDrinks ?? rs.pendingAttackFixedTotal)
          : Math.max(0, this.pendingAttackTotalDrinks ?? 0);

      const attackerId = rs.pendingAttackFromPlayerId;
      if (!attackerId) return;

      const effectIdsToDelete = [...this.usedEffectIds];

      await this.gameSession.reflectPendingAttack(
        sessionId,
        me.id,
        attackerId,
        fixedTotal,
        effectIdsToDelete
      );

      this.usedEffectIds = [];
      this.reflectAvailable = false;
      this.reflectEffectIndex = null;

      await this.refreshEffectsCacheIfNeeded(true);
    } catch (e) {
      console.error('Feil ved reflectPendingAttack:', e);
    }
  }

  onSelectTarget(playerId: string) {
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

    if (effect) this.usedEffectIds.push(effect.id);
  }

  private async syncPendingAttackEffectsFromCache() {
    const rs = this.roundState;
    const sessionId = this.sessionId;

    this.reflectAvailable = false;
    this.reflectEffectIndex = null;

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
      this.reflectAvailable = false;
      this.reflectEffectIndex = null;

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

      this.resetRandomOverlay();
      return;
    }

    this.pendingAttackTarget =
      this.players.find((p) => p.id === rs.pendingAttackToPlayerId) ?? null;

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

    this.pendingAttackEffects = this.getEffectsForPlayerFromCache(rs.pendingAttackToPlayerId);

    this.usedEffectIds = [];

    const curseCards: Card[] = this.pendingAttackEffects
      .filter((e) => e.effectType === 'curse')
      .map((e) => {
        try {
          return this.cards.getCardById(e.cardId);
        } catch {
          return null;
        }
      })
      .filter((c): c is Card => !!c)
      .filter((c) => !(c.passive ?? []).includes('skip'));

    const defenceCards: Card[] = this.pendingAttackEffects
      .filter((e) => e.effectType === 'defence')
      .map((e) => {
        try {
          return this.cards.getCardById(e.cardId);
        } catch {
          return null;
        }
      })
      .filter((c): c is Card => !!c);

    const cursePriority: Record<string, number> = { increase: 0, double: 1 };
    const defencePriority: Record<string, number> = { reflect: 0, shield: 1, reduce: 2, half: 3 };

    const getPriority = (card: Card, map: Record<string, number>) => {
      const passives = card.passive ?? [];
      let best = Number.POSITIVE_INFINITY;
      for (const p of passives) {
        if (map[p] !== undefined) best = Math.min(best, map[p]);
      }
      return best;
    };

    const sortedCurse = [...curseCards].sort(
      (a, b) => getPriority(a, cursePriority) - getPriority(b, cursePriority)
    );

    const sortedDefence = [...defenceCards].sort(
      (a, b) => getPriority(a, defencePriority) - getPriority(b, defencePriority)
    );

    const fullSeq = [this.pendingAttackCard, ...sortedCurse, ...sortedDefence];

    let total = 0;
    let baseSet = false;

    const baseAttackTotal =
      rs.pendingAttackIsReflect && rs.pendingAttackFixedTotal != null
        ? rs.pendingAttackFixedTotal
        : this.pendingAttackCard.drinkAmount;

    for (const card of fullSeq) {
      if (card.type === 'attack') {
        total = baseAttackTotal;
        baseSet = true;
        continue;
      }

      if (card.type === 'curse') {
        if (!baseSet) continue;

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
      }
    }

    for (const card of sortedDefence) {
      if (!baseSet) break;
      if (total === 0) break;

      const passives = card.passive ?? [];

      if (passives.includes('reflect')) {
        this.reflectAvailable = true;
        this.markEffectUsedForCard(card, 'defence');
        break;
      }

      let used = false;

      for (const passive of passives) {
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
        if (total === 0) break;
      }

      if (used) this.markEffectUsedForCard(card, 'defence');
    }

    if (this.reflectAvailable) {
      const reflectIdx = fullSeq.findIndex(
        (c) => c.type === 'defence' && (c.passive ?? []).includes('reflect')
      );
      this.attackSequenceCards = reflectIdx >= 0 ? fullSeq.slice(0, reflectIdx + 1) : fullSeq;
    } else {
      this.attackSequenceCards = fullSeq;
    }

    if (this.reflectAvailable) {
      const effectsOnly = this.attackSequenceCards.slice(1);
      const idx = effectsOnly.findIndex(
        (c) => c.type === 'defence' && (c.passive ?? []).includes('reflect')
      );
      this.reflectEffectIndex = idx >= 0 ? idx : null;
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
    if (this.reflectUiReady) return false;
    if (this.expectedEffectCount <= 0) return true;
    return this.animState === 'done';
  }

  get canConfirmReflect(): boolean {
    if (this.viewState !== 'drinking') return false;
    if (!this.reflectUiReady) return false;
    if (this.expectedEffectCount <= 0) return true;
    return this.animState === 'done';
  }

  private stopAttackAnimation() {
    if (this.attackAnimTimer) {
      clearTimeout(this.attackAnimTimer);
      this.attackAnimTimer = null;
    }
  }

  private stopRandomTimers() {
    if (this.randomCountdownTimer) clearInterval(this.randomCountdownTimer);
    if (this.randomSpinTimer) clearTimeout(this.randomSpinTimer);
    if (this.randomFadeTimer) clearTimeout(this.randomFadeTimer);
    this.randomCountdownTimer = null;
    this.randomSpinTimer = null;
    this.randomFadeTimer = null;
  }

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

  private startRandomSequenceIfNeeded() {
    const rs = this.roundState;

    if (!rs || !rs.pendingAttack || !this.isRandomPendingAttack) {
      if (this.randomOverlayVisible || this.randomPhase !== 'idle') {
        this.resetRandomOverlay();
      }
      return;
    }

    const key = `${rs.pendingAttackCardId}|${rs.pendingAttackFromPlayerId}|${rs.pendingAttackToPlayerId}`;
    if (this.randomKey === key) return;

    this.randomKey = key;

    const alive = this.players.filter((p) => (p.lives ?? 0) > 0);
    const baseList = [...alive].sort((a, b) => a.id.localeCompare(b.id));

    this.randomWheelWinner = this.pendingAttackTarget ?? null;

    this.randomOverlayVisible = true;
    this.randomOverlayHiding = false;
    this.randomPhase = 'countdown';
    this.randomCountdown = 5;

    this.buildWheelReel(baseList, this.randomWheelWinner);

    this.wheelTransition = 'none';
    this.wheelTransform = 'translateY(0px)';

    this.stopRandomTimers();
    this.randomCountdownTimer = setInterval(() => {
      this.randomCountdown = Math.max(0, this.randomCountdown - 1);
      try {
        this.cdr.detectChanges();
      } catch {}

      if (this.randomCountdown <= 0) {
        if (this.randomCountdownTimer) clearInterval(this.randomCountdownTimer);
        this.randomCountdownTimer = null;

        this.startWheelSpinToWinner();
      }
    }, 1000);

    this.updateViewStateFromRoundState();
  }

  private buildWheelReel(baseList: Player[], winner: Player | null) {
    const bufferCycles = 6;
    const mainCycles = 24;
    const totalCycles = bufferCycles + mainCycles + bufferCycles;

    const reel: Player[] = [];
    for (let i = 0; i < totalCycles; i++) {
      reel.push(...baseList);
    }

    const winnerId = winner?.id ?? baseList[0]?.id ?? null;

    let winnerIdxInBase = baseList.findIndex((p) => p.id === winnerId);
    if (winnerIdxInBase < 0) winnerIdxInBase = 0;

    const landingCycle = bufferCycles + (mainCycles - 3);
    const landingBase = landingCycle * baseList.length;
    const landingIndex = landingBase + winnerIdxInBase;

    this.wheelReelItems = reel;

    const startIndex = bufferCycles * baseList.length;
    this._wheelStartIndex = startIndex;
    this._wheelLandingIndex = landingIndex;

    const startY = startIndex * this.WHEEL_ITEM_H;
    this.wheelTransition = 'none';
    this.wheelTransform = `translateY(-${startY}px)`;

    try {
      this.cdr.detectChanges();
    } catch {}
  }

  private _wheelLandingIndex: number = 0;
  private _wheelStartIndex: number = 0;

  private startWheelSpinToWinner() {
    if (!this.randomOverlayVisible) return;

    this.randomPhase = 'spinning';

    const landingIndex = this._wheelLandingIndex ?? 0;
    const startIndex = this._wheelStartIndex ?? 0;

    const startY = startIndex * this.WHEEL_ITEM_H;
    this.wheelTransition = 'none';
    this.wheelTransform = `translateY(-${startY}px)`;

    const safeMargin = 1;
    const halfItem = this.WHEEL_ITEM_H / 2;

    const randomOffset =
      Math.random() * (this.WHEEL_ITEM_H - safeMargin * 2) - halfItem + safeMargin;

    const finalY =
      landingIndex * this.WHEEL_ITEM_H + halfItem + randomOffset - this.WHEEL_WINDOW_H / 2;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.wheelTransition = 'transform 10s cubic-bezier(0.08, 0.85, 0.12, 1)';
        this.wheelTransform = `translateY(-${finalY}px)`;
        try {
          this.cdr.detectChanges();
        } catch {}
      });
    });

    this.randomSpinTimer = setTimeout(() => {
      this.randomSpinTimer = null;
      this.randomPhase = 'done';

      this.randomOverlayHiding = true;

      this.randomFadeTimer = setTimeout(() => {
        this.randomFadeTimer = null;
        this.randomOverlayVisible = false;
        this.randomOverlayHiding = false;

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

  private buildAttackKey(rs: RoundState, effects: PlayerEffect[]): string {
    const effectIds = effects
      .map((e) => e.id)
      .sort()
      .join(',');
    return `${rs.pendingAttackCardId}|${rs.pendingAttackToPlayerId}|${effectIds}|${
      rs.pendingAttackIsReflect ? 'R' : 'N'
    }|${rs.pendingAttackFixedTotal ?? ''}`;
  }

  private computeStepTotals(sequence: Card[], baseOverride: number | null): number[] {
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
          total = baseOverride != null ? baseOverride : card.drinkAmount;
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

          const passives = card.passive ?? [];
          if (passives.includes('reflect')) break;

          for (const p of passives) {
            if (p === 'shield') total = 0;
            if (p === 'reduce') total = Math.max(0, total - card.drinkAmount);
            if (p === 'half') total = Math.ceil(total / 2);
            if (total === 0) break;
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
      const rot = Math.floor(Math.random() * 51) - 25;
      this.effectRotations.push(`${rot}deg`);

      const from = Math.random() < 0.5 ? '-140vw' : '140vw';
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

    const baseOverride =
      rs.pendingAttackIsReflect && rs.pendingAttackFixedTotal != null
        ? rs.pendingAttackFixedTotal
        : null;

    this.stepTotals = this.computeStepTotals(this.attackSequenceCards, baseOverride);

    const base = baseOverride != null ? baseOverride : this.pendingAttackCard?.drinkAmount ?? 0;
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

    const rs = this.roundState;

    const base =
      rs?.pendingAttackIsReflect && rs?.pendingAttackFixedTotal != null
        ? rs.pendingAttackFixedTotal
        : this.pendingAttackCard.drinkAmount;

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

    const currentTurnId = rs.turnOrder?.[rs.currentTurnIndex] ?? null;
    if (rs.pendingAttack) return;
    if (currentTurnId !== me.id) return;

    const effects = this.getEffectsForPlayerFromCache(me.id);
    const skipIds: string[] = [];

    for (const e of effects) {
      if (e.effectType !== 'curse') continue;

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
    await this.refreshEffectsCacheIfNeeded(true);
    throw new Error('__SKIP_CONSUMED__');
  }

  playerHasSkip: Record<string, boolean> = {};

  private refreshSkipIndicatorsFromCache() {
    const map: Record<string, boolean> = {};

    for (const p of this.players) {
      const effects = this.getEffectsForPlayerFromCache(p.id);
      map[p.id] = effects.some((e) => {
        if (e.effectType !== 'curse') return false;
        try {
          const c = this.cards.getCardById(e.cardId);
          return (c.passive ?? []).includes('skip');
        } catch {
          return false;
        }
      });
    }

    this.playerHasSkip = map;
  }

  private sortPlayersByTurnOrder(players: Player[], rs: RoundState | null): Player[] {
    if (!rs || !rs.turnOrder?.length) return players;

    const orderMap = new Map<string, number>();
    rs.turnOrder.forEach((id, index) => orderMap.set(id, index));

    return [...players].sort((a, b) => {
      const ia = orderMap.get(a.id);
      const ib = orderMap.get(b.id);

      if (ia === undefined && ib === undefined) return 0;
      if (ia === undefined) return 1;
      if (ib === undefined) return -1;

      return ia - ib;
    });
  }

  private hardSyncTimer: any = null;
  private lastRoundUpdatedAt: string | null = null;

  private startHardSync() {
    if (this.hardSyncTimer) return;

    this.hardSyncTimer = setInterval(async () => {
      if (!this.sessionId) return;
      if (document.visibilityState !== 'visible') return;

      try {
        const rs = await this.gameSession.getRoundState(this.sessionId);
        if (!rs) return;

        const updatedAt = (rs as any).updated_at ?? (rs as any).updatedAt ?? null;

        if (updatedAt && this.lastRoundUpdatedAt === updatedAt) return;

        this.lastRoundUpdatedAt = updatedAt;
        this.roundState = rs;

        // Når round_state faktisk endrer seg: kjør en resync (throttlet + singleflight)
        this.fullResyncThrottled(0);
      } catch {}
    }, 2000);
  }

  private stopHardSync() {
    if (this.hardSyncTimer) clearInterval(this.hardSyncTimer);
    this.hardSyncTimer = null;
  }
}
