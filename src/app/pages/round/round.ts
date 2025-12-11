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

  // Effekter relatert til et pågående angrep
  pendingAttackCard: Card | null = null;
  pendingAttackEffects: PlayerEffect[] = [];
  attackSequenceCards: Card[] = []; // [attack, ...curses, ...defences]
  pendingAttackTotalDrinks: number | null = null;
  pendingAttackTarget: Player | null = null;

  // Hvilke player_effect-rader som faktisk ble brukt i denne drinking-sekvensen
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

      await this.syncPendingAttackEffects();

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
      const total = this.pendingAttackTotalDrinks ?? this.pendingAttackCard?.drinkAmount ?? 0;

      const effectIdsToDelete = [...this.usedEffectIds];

      await this.gameSession.resolveAttackClientSide(sessionId, me.id, total, effectIdsToDelete);

      // Etter vellykket sletting og livsoppdatering:
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

  /**
   * Marker at et effektkort (player_effect) er brukt,
   * basert på Card + effectType ('curse' / 'defence').
   * Vi plukker første PlayerEffect som matcher cardId + type
   * og som IKKE allerede ligger i usedEffectIds.
   */
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

    // Rekkefølge: attack -> curse -> defence
    this.attackSequenceCards = [this.pendingAttackCard, ...curseCards, ...defenceCards];

    let total = 0;
    let baseSet = false; // om vi har satt grunnverdien (fra attack)
    let skipRemainingEffects = false; // brukes ved attack + random

    for (const card of this.attackSequenceCards) {
      // Hvis attack var random, skal vi skippe alle curse/defence etterpå uten å bruke eller fjerne dem
      if (skipRemainingEffects && card.type !== 'attack') {
        continue;
      }

      switch (card.type) {
        case 'attack': {
          let localBaseSet = false;

          if (!card.passive || card.passive.length === 0) {
            // Ingen passiv → bruk bare kortets drinkingAmount
            total = card.drinkAmount;
            baseSet = true;
            localBaseSet = true;
          } else {
            // For attack: i praksis none / random
            for (const passive of card.passive) {
              switch (passive) {
                case 'none':
                  total = card.drinkAmount;
                  baseSet = true;
                  localBaseSet = true;
                  break;

                case 'random':
                  // Attack er random → ingen curse/defence får påvirke
                  total = card.drinkAmount;
                  baseSet = true;
                  localBaseSet = true;
                  skipRemainingEffects = true;
                  break;

                // resten ikke brukt på attack nå:
                case 'double':
                case 'half':
                case 'increase':
                case 'reduce':
                case 'reflect':
                case 'shield':
                case 'skip':
                default:
                  break;
              }
            }

            if (!localBaseSet) {
              // Fall-back: hvis ingen passiv faktisk gjorde noe, bruk kortets verdi
              total = card.drinkAmount;
              baseSet = true;
            }
          }
          break;
        }

        case 'curse': {
          if (!baseSet) {
            // Har ikke noe å modifisere ennå (burde ikke skje, siden attack alltid er først)
            break;
          }

          if (!card.passive || card.passive.length === 0) {
            // Ingen passiv → gjør ingenting
          } else {
            // curse: typisk increase/double/half – skip brukes når spilleren skal miste tur, ikke her
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

                // ikke brukt i denne fasen:
                case 'none':
                case 'random':
                case 'reduce':
                case 'reflect':
                case 'shield':
                case 'skip':
                default:
                  break;
              }
            }

            if (usedEffect) {
              // Curse-kortet er brukt i denne drinking → logg effect-id for sletting
              this.markEffectUsedForCard(card, 'curse');
            }
          }
          break;
        }

        case 'defence': {
          if (!baseSet) {
            // Ingen base-verdi å forsvare mot
            break;
          }

          if (!card.passive || card.passive.length === 0) {
            // Ingen passiv → gjør ingenting
          } else {
            // i teorien: shield, reduce, half, reflect
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
                  // TODO: senere – nå bare nuller vi target sin damage
                  total = 0;
                  usedEffect = true;
                  break;

                // ikke brukt i denne fasen:
                case 'none':
                case 'skip':
                case 'double':
                case 'increase':
                case 'random':
                default:
                  break;
              }
            }

            if (usedEffect) {
              // Defence-kortet er brukt i denne drinking → logg effect-id for sletting
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
    // beholder type på engelsk – evt. uppercased hvis du vil ha mer “label”-preg
    return card.type.toUpperCase(); // ATTACK / CURSE / DEFENCE
  }

  getCardPassive(card: Card): string {
    if (!card.passive || !card.passive.length) {
      return 'none';
    }
    // viser passives som "reduce, double, shield"
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
}
