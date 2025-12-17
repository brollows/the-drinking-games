import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { CardType } from '../cards/card';

export interface GameSession {
  id: string;
  joinCode: string;
  hostName: string;
  createdAt: string;
  phase: string;
  startLives: number;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  sessionId: string;
  createdAt: string;
  lives: number;
  eliminatedAt?: string | null;
}

export interface RoundState {
  sessionId: string;
  turnOrder: string[];
  currentTurnIndex: number;

  lastCardId: string | null;
  lastCardType: CardType | null;
  lastFromPlayerId: string | null;
  lastToPlayerId: string | null;

  pendingAttack: boolean;
  pendingAttackCardId: string | null;
  pendingAttackFromPlayerId: string | null;
  pendingAttackToPlayerId: string | null;

  pendingAttackFixedTotal?: number | null;
  pendingAttackIsReflect?: boolean;
}

export interface PlayerEffect {
  id: string;
  sessionId: string;
  playerId: string;
  cardId: string;
  effectType: 'defence' | 'curse';
  createdAt: string;
}

const START_LIVES = 40;
type Unsub = () => void;

@Injectable({
  providedIn: 'root',
})
export class GameSessionService {
  private _currentSession: GameSession | null = null;
  private _currentPlayer: Player | null = null;

  constructor(private supabase: SupabaseService) {}

  get currentSession(): GameSession | null {
    return this._currentSession;
  }

  get currentPlayer(): Player | null {
    return this._currentPlayer;
  }

  private generateJoinCode(length: number = 4): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createHostSession(hostName: string): Promise<GameSession> {
    const joinCode = this.generateJoinCode();

    const { data: session, error: sessionError } = await this.supabase.client
      .from('game_sessions')
      .insert({
        host_name: hostName,
        code: joinCode,
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error('Feil ved opprettelse av session:', sessionError);
      throw sessionError ?? new Error('Kunne ikke opprette session');
    }

    const newSession: GameSession = {
      id: session.id,
      joinCode: session.code,
      hostName: session.host_name,
      createdAt: session.created_at,
      phase: session.phase,
      startLives: session.start_lives ?? START_LIVES,
    };

    this._currentSession = newSession;

    const { data: player, error: playerError } = await this.supabase.client
      .from('players')
      .insert({
        name: hostName,
        is_host: true,
        session_id: session.id,
        lives: this._currentSession?.startLives ?? START_LIVES,
      })
      .select()
      .single();

    if (playerError || !player) {
      console.error('Feil ved opprettelse av host-player:', playerError);
      throw playerError ?? new Error('Kunne ikke opprette host-player');
    }

    const newPlayer: Player = {
      id: player.id,
      name: player.name,
      isHost: player.is_host,
      sessionId: player.session_id,
      createdAt: player.created_at,
      lives: player.lives,
      eliminatedAt: player.eliminated_at ?? null,
    };

    this._currentPlayer = newPlayer;

    return newSession;
  }

  async joinSession(joinCode: string, playerName: string): Promise<GameSession> {
    const normalizedCode = joinCode.trim().toUpperCase();
    const trimmedName = playerName.trim();

    if (!normalizedCode || !trimmedName) {
      throw new Error('Mangler kode eller navn');
    }

    const { data: session, error: sessionError } = await this.supabase.client
      .from('game_sessions')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (sessionError) {
      console.error('Feil ved oppslag av session:', sessionError);
      throw sessionError;
    }

    if (!session) {
      throw new Error('Fant ingen spill med den koden 🥲');
    }

    const joinedSession: GameSession = {
      id: session.id,
      joinCode: session.code,
      hostName: session.host_name,
      createdAt: session.created_at,
      phase: session.phase,
      startLives: session.start_lives ?? START_LIVES,
    };

    this._currentSession = joinedSession;

    const { data: player, error: playerError } = await this.supabase.client
      .from('players')
      .insert({
        name: trimmedName,
        is_host: false,
        session_id: session.id,
        lives: this._currentSession?.startLives ?? START_LIVES,
      })
      .select()
      .single();

    if (playerError || !player) {
      console.error('Feil ved opprettelse av player:', playerError);
      throw playerError ?? new Error('Kunne ikke opprette player');
    }

    const newPlayer: Player = {
      id: player.id,
      name: player.name,
      isHost: player.is_host,
      sessionId: player.session_id,
      createdAt: player.created_at,
      lives: player.lives ?? START_LIVES,
      eliminatedAt: player.eliminated_at ?? null,
    };

    this._currentPlayer = newPlayer;

    return joinedSession;
  }

  async fetchSessionById(sessionId: string): Promise<GameSession | null> {
    const { data, error } = await this.supabase.client
      .from('game_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      console.error('Feil ved henting av session:', error);
      throw error;
    }

    if (!data) return null;

    const sess: GameSession = {
      id: data.id,
      joinCode: data.code,
      hostName: data.host_name,
      createdAt: data.created_at,
      phase: data.phase,
      startLives: data.start_lives ?? START_LIVES,
    };

    this._currentSession = sess;
    return sess;
  }

  async getPlayersForSession(sessionId: string): Promise<Player[]> {
    const { data, error } = await this.supabase.client
      .from('players')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Feil ved henting av players:', error);
      throw error;
    }

    if (!data) return [];

    return data.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.is_host,
      sessionId: p.session_id,
      createdAt: p.created_at,
      lives: p.lives,
      eliminatedAt: p.eliminated_at ?? null,
    })) as Player[];
  }

  async setSessionPhase(sessionId: string, phase: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('game_sessions')
      .update({ phase })
      .eq('id', sessionId);

    if (error) {
      console.error('Feil ved oppdatering av session-phase:', error);
      throw error;
    }

    if (this._currentSession && this._currentSession.id === sessionId) {
      this._currentSession = { ...this._currentSession, phase };
    }
  }

  async startRound(sessionId: string): Promise<void> {
    const players = await this.getPlayersForSession(sessionId);
    if (!players.length) throw new Error('Ingen spillere i spillet');

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const order = shuffled.map((p) => p.id);

    const { error } = await this.supabase.client.from('round_state').insert({
      session_id: sessionId,
      turn_order: order,
      current_turn_index: 0,
    });

    if (error) {
      console.error('Kunne ikke starte round_state:', error);
      throw error;
    }
  }

  async getRoundState(sessionId: string): Promise<RoundState | null> {
    const { data, error } = await this.supabase.client
      .from('round_state')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) {
      console.error('Feil ved getRoundState:', error);
      throw error;
    }

    if (!data) return null;

    return {
      sessionId: data.session_id,
      turnOrder: data.turn_order,
      currentTurnIndex: data.current_turn_index,
      lastCardId: data.last_card_id,
      lastCardType: data.last_card_type,
      lastFromPlayerId: data.last_from_player_id,
      lastToPlayerId: data.last_to_player_id,
      pendingAttack: data.pending_attack,
      pendingAttackCardId: data.pending_attack_card_id,
      pendingAttackFromPlayerId: data.pending_attack_from_player_id,
      pendingAttackToPlayerId: data.pending_attack_to_player_id,
      pendingAttackFixedTotal: data.pending_attack_fixed_total,
      pendingAttackIsReflect: data.pending_attack_is_reflect,
    };
  }

  subscribeToRoundState(sessionId: string, onChange: (rs: RoundState | null) => void): Unsub {
    const ch = this.supabase.client
      .channel(`rs:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_state',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: any) => {
          const row = (payload?.new ?? null) as any;
          if (!row) {
            onChange(null);
            return;
          }

          onChange({
            sessionId: row.session_id,
            turnOrder: row.turn_order,
            currentTurnIndex: row.current_turn_index,
            lastCardId: row.last_card_id,
            lastCardType: row.last_card_type,
            lastFromPlayerId: row.last_from_player_id,
            lastToPlayerId: row.last_to_player_id,
            pendingAttack: row.pending_attack,
            pendingAttackCardId: row.pending_attack_card_id,
            pendingAttackFromPlayerId: row.pending_attack_from_player_id,
            pendingAttackToPlayerId: row.pending_attack_to_player_id,
            pendingAttackFixedTotal: row.pending_attack_fixed_total,
            pendingAttackIsReflect: row.pending_attack_is_reflect,
          });
        }
      )
      .subscribe();

    return () => {
      this.supabase.client.removeChannel(ch);
    };
  }

  subscribeToPlayers(sessionId: string, onAnyChange: () => void): Unsub {
    const ch = this.supabase.client
      .channel(`players:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          onAnyChange();
        }
      )
      .subscribe();

    return () => {
      this.supabase.client.removeChannel(ch);
    };
  }

  subscribeToSession(sessionId: string, onAnyChange: () => void): Unsub {
    const ch = this.supabase.client
      .channel(`sess:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${sessionId}`,
        },
        () => {
          onAnyChange();
        }
      )
      .subscribe();

    return () => {
      this.supabase.client.removeChannel(ch);
    };
  }

  async playAttackCard(
    sessionId: string,
    fromPlayerId: string,
    toPlayerId: string,
    cardId: string
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('round_state')
      .update({
        pending_attack: true,
        pending_attack_card_id: cardId,
        pending_attack_from_player_id: fromPlayerId,
        pending_attack_to_player_id: toPlayerId,
        last_card_id: cardId,
        last_card_type: 'attack',
        last_from_player_id: fromPlayerId,
        last_to_player_id: toPlayerId,
        pending_attack_fixed_total: null,
        pending_attack_is_reflect: false,
      })
      .eq('session_id', sessionId);

    if (error) {
      console.error('Feil ved playAttackCard:', error);
      throw error;
    }
  }

  async playDefenceCard(sessionId: string, playerId: string, cardId: string): Promise<void> {
    const { error } = await this.supabase.client.from('player_effects').insert({
      session_id: sessionId,
      player_id: playerId,
      card_id: cardId,
      effect_type: 'defence',
    });

    if (error) {
      console.error('Feil ved playDefenceCard:', error);
      throw error;
    }

    const { error: rsError } = await this.supabase.client
      .from('round_state')
      .update({
        last_card_id: cardId,
        last_card_type: 'defence',
        last_from_player_id: playerId,
        last_to_player_id: null,
      })
      .eq('session_id', sessionId);

    if (rsError) {
      console.error('Feil ved oppdatering av round_state etter defence:', rsError);
      throw rsError;
    }
  }

  async playCurseCard(
    sessionId: string,
    fromPlayerId: string,
    targetPlayerId: string,
    cardId: string
  ): Promise<void> {
    const { error } = await this.supabase.client.from('player_effects').insert({
      session_id: sessionId,
      player_id: targetPlayerId,
      card_id: cardId,
      effect_type: 'curse',
    });

    if (error) {
      console.error('Feil ved playCurseCard:', error);
      throw error;
    }

    const { error: rsError } = await this.supabase.client
      .from('round_state')
      .update({
        last_card_id: cardId,
        last_card_type: 'curse',
        last_from_player_id: fromPlayerId,
        last_to_player_id: null,
      })
      .eq('session_id', sessionId);

    if (rsError) {
      console.error('Feil ved oppdatering av round_state etter curse:', rsError);
      throw rsError;
    }
  }

  async advanceTurn(sessionId: string): Promise<void> {
    const roundState = await this.getRoundState(sessionId);
    if (!roundState) throw new Error('Ingen round_state for session');
    if (!roundState.turnOrder?.length) return;

    const len = roundState.turnOrder.length;
    const cur = typeof roundState.currentTurnIndex === 'number' ? roundState.currentTurnIndex : 0;
    const safeCur = cur < 0 || cur >= len ? 0 : cur;

    const nextIndex = (safeCur + 1) % len;

    const { error } = await this.supabase.client
      .from('round_state')
      .update({
        current_turn_index: nextIndex,
      })
      .eq('session_id', sessionId);

    if (error) {
      console.error('Feil ved advanceTurn:', error);
      throw error;
    }
  }

  async getAllPlayerEffectsForSession(sessionId: string): Promise<PlayerEffect[]> {
    const { data, error } = await this.supabase.client
      .from('player_effects')
      .select('*')
      .eq('session_id', sessionId);

    if (error) {
      console.error('Feil ved henting av player_effects:', error);
      throw error;
    }

    if (!data) return [];

    return data.map((e) => ({
      id: e.id,
      sessionId: e.session_id,
      playerId: e.player_id,
      cardId: e.card_id,
      effectType: e.effect_type,
      createdAt: e.created_at,
    })) as PlayerEffect[];
  }

  async getPlayerEffectsForSession(sessionId: string, playerId: string): Promise<PlayerEffect[]> {
    const { data, error } = await this.supabase.client
      .from('player_effects')
      .select('*')
      .eq('session_id', sessionId)
      .eq('player_id', playerId);

    if (error) {
      console.error('Feil ved henting av player_effects:', error);
      throw error;
    }

    if (!data) return [];

    return data.map((e) => ({
      id: e.id,
      sessionId: e.session_id,
      playerId: e.player_id,
      cardId: e.card_id,
      effectType: e.effect_type,
      createdAt: e.created_at,
    })) as PlayerEffect[];
  }

  async deletePlayerEffect(effectId: string): Promise<void> {
    const { error } = await this.supabase.client.from('player_effects').delete().eq('id', effectId);

    if (error) {
      console.error('Feil ved sletting av player_effect:', error);
      throw error;
    }
  }

  async resolveAttackClientSide(
    sessionId: string,
    targetPlayerId: string,
    totalDrinks: number,
    usedEffectIds: string[]
  ): Promise<void> {
    const roundState = await this.getRoundState(sessionId);
    if (!roundState || !roundState.pendingAttack || !roundState.pendingAttackCardId) {
      throw new Error('Ingen aktivt angrep å resolvere (client-side).');
    }

    if (roundState.pendingAttackToPlayerId !== targetPlayerId) {
      throw new Error('Dette angrepet er ikke på denne spilleren.');
    }

    if (
      roundState.pendingAttackIsReflect &&
      roundState.pendingAttackFixedTotal !== null &&
      roundState.pendingAttackFixedTotal !== undefined
    ) {
      totalDrinks = roundState.pendingAttackFixedTotal;
    }

    if (totalDrinks < 0) totalDrinks = 0;

    const { data: target, error: targetError } = await this.supabase.client
      .from('players')
      .select('*')
      .eq('id', targetPlayerId)
      .single();

    if (targetError || !target) {
      console.error('Feil ved henting av target player:', targetError);
      throw targetError ?? new Error('Fant ikke spiller');
    }

    const newLives = Math.max(0, (target.lives ?? 0) - totalDrinks);

    const justDied = newLives === 0 && target.eliminated_at == null;

    const update: any = { lives: newLives };

    if (justDied) {
      update.eliminated_at = new Date().toISOString();
    }

    const { error: livesError } = await this.supabase.client
      .from('players')
      .update(update)
      .eq('id', targetPlayerId);

    if (livesError) {
      console.error('Feil ved oppdatering av liv (client-side):', livesError);
      throw livesError;
    }

    if (usedEffectIds && usedEffectIds.length > 0) {
      const { error: delError } = await this.supabase.client
        .from('player_effects')
        .delete()
        .in('id', usedEffectIds);

      if (delError) {
        console.error('Feil ved sletting av brukte player_effects (client-side):', delError);
      }
    }

    const len = roundState.turnOrder?.length ?? 0;
    const cur = typeof roundState.currentTurnIndex === 'number' ? roundState.currentTurnIndex : 0;
    const safeCur = len > 0 && (cur < 0 || cur >= len) ? 0 : cur;

    const nextIndex = len === 0 ? 0 : (safeCur + 1) % len;

    const { error: rsError } = await this.supabase.client
      .from('round_state')
      .update({
        pending_attack: false,
        pending_attack_card_id: null,
        pending_attack_from_player_id: null,
        pending_attack_to_player_id: null,
        pending_attack_fixed_total: null,
        pending_attack_is_reflect: false,
        current_turn_index: nextIndex,
      })
      .eq('session_id', sessionId);

    if (rsError) {
      console.error('Feil ved oppdatering av round_state etter client-side resolusjon:', rsError);
      throw rsError;
    }
  }

  async removePlayerEffects(sessionId: string, effectIds: string[]): Promise<void> {
    if (!effectIds?.length) return;

    const { error } = await this.supabase.client
      .from('player_effects')
      .delete()
      .eq('session_id', sessionId)
      .in('id', effectIds);

    if (error) {
      console.error('Feil ved removePlayerEffects:', error);
      throw error;
    }
  }

  async reflectPendingAttack(
    sessionId: string,
    reflectorId: string,
    sendToPlayerId: string,
    fixedTotal: number,
    usedEffectIds: string[]
  ): Promise<void> {
    const rs = await this.getRoundState(sessionId);

    if (!rs || !rs.pendingAttack || !rs.pendingAttackCardId) {
      throw new Error('Ingen aktivt angrep å reflecte.');
    }

    if (rs.pendingAttackToPlayerId !== reflectorId) {
      throw new Error('Dette angrepet er ikke på denne spilleren (reflect).');
    }

    if (!rs.pendingAttackFromPlayerId || rs.pendingAttackFromPlayerId !== sendToPlayerId) {
      throw new Error('Mottaker matcher ikke round_state (reflect).');
    }

    if (fixedTotal < 0) fixedTotal = 0;

    if (usedEffectIds && usedEffectIds.length > 0) {
      const { error: delError } = await this.supabase.client
        .from('player_effects')
        .delete()
        .in('id', usedEffectIds);

      if (delError) {
        console.error('Feil ved sletting av brukte effects (reflect):', delError);
        throw delError;
      }
    }

    const { error: rsError } = await this.supabase.client
      .from('round_state')
      .update({
        pending_attack: true,
        pending_attack_from_player_id: reflectorId,
        pending_attack_to_player_id: sendToPlayerId,
        pending_attack_fixed_total: fixedTotal,
        pending_attack_is_reflect: true,
        last_from_player_id: reflectorId,
        last_to_player_id: sendToPlayerId,
        last_card_id: rs.pendingAttackCardId,
        last_card_type: 'attack',
      })
      .eq('session_id', sessionId);

    if (rsError) {
      console.error('Feil ved oppdatering av round_state (reflect):', rsError);
      throw rsError;
    }
  }

  async setStartLives(sessionId: string, startLives: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('game_sessions')
      .update({ start_lives: startLives })
      .eq('id', sessionId);

    if (error) {
      console.error('Feil ved oppdatering av start_lives:', error);
      throw error;
    }

    if (this._currentSession?.id === sessionId) {
      this._currentSession = { ...this._currentSession, startLives };
    }
  }

  async applyStartLivesToPlayers(sessionId: string): Promise<void> {
    const session = await this.fetchSessionById(sessionId);
    const startLives = session?.startLives ?? 40;

    const { error } = await this.supabase.client
      .from('players')
      .update({ lives: startLives, eliminated_at: null })
      .eq('session_id', sessionId);

    if (error) {
      console.error('Feil ved applyStartLivesToPlayers:', error);
      throw error;
    }
  }

  async repairTurnIndex(sessionId: string, safeIndex: number): Promise<void> {
    const { error } = await this.supabase.client
      .from('round_state')
      .update({ current_turn_index: safeIndex })
      .eq('session_id', sessionId);

    if (error) {
      console.error('Feil ved repairTurnIndex:', error);
      throw error;
    }
  }
}
