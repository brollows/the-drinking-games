import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Card, CardType } from '../cards/card';

export interface GameSession {
  id: string;
  joinCode: string;
  hostName: string;
  createdAt: string;
  phase: string;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  sessionId: string;
  createdAt: string;
  lives: number;
}

export interface RoundState {
  sessionId: string;
  turnOrder: string[]; // array med player.id
  currentTurnIndex: number;

  lastCardId: string | null;
  lastCardType: CardType | null;
  lastFromPlayerId: string | null;
  lastToPlayerId: string | null;

  pendingAttack: boolean;
  pendingAttackCardId: string | null;
  pendingAttackFromPlayerId: string | null;
  pendingAttackToPlayerId: string | null;
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

  async createHostSession(hostName: string): Promise<GameSession> {
    const joinCode = this.generateJoinCode();

    // 1) Opprett session i Supabase
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
    };

    this._currentSession = newSession;

    // 2) Registrer host som player i `players`
    const { data: player, error: playerError } = await this.supabase.client
      .from('players')
      .insert({
        name: hostName,
        is_host: true,
        session_id: session.id,
        lives: START_LIVES,
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
    };

    this._currentPlayer = newPlayer;

    console.log('Ny session opprettet:', newSession);
    console.log('Host-player opprettet:', newPlayer);

    return newSession;
  }

  private generateJoinCode(length: number = 4): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';

    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return code;
  }

  async joinSession(joinCode: string, playerName: string): Promise<GameSession> {
    const normalizedCode = joinCode.trim().toUpperCase();
    const trimmedName = playerName.trim();

    if (!normalizedCode || !trimmedName) {
      throw new Error('Mangler kode eller navn');
    }

    // 1) Finn session basert på kode
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
    };

    this._currentSession = joinedSession;

    // 2) Opprett player i `players`
    const { data: player, error: playerError } = await this.supabase.client
      .from('players')
      .insert({
        name: trimmedName,
        is_host: false,
        session_id: session.id,
        lives: START_LIVES,
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
    };

    this._currentPlayer = newPlayer;

    console.log('Spiller joinet session:', joinedSession);
    console.log('Player:', newPlayer);

    return joinedSession;
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

    if (!data) {
      return [];
    }

    return data.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.is_host,
      sessionId: p.session_id,
      createdAt: p.created_at,
      lives: p.lives,
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

    if (!data) {
      return null;
    }

    const sess: GameSession = {
      id: data.id,
      joinCode: data.code,
      hostName: data.host_name,
      createdAt: data.created_at,
      phase: data.phase,
    };

    this._currentSession = sess;
    return sess;
  }

  async startRound(sessionId: string): Promise<void> {
    const players = await this.getPlayersForSession(sessionId);
    if (!players.length) {
      throw new Error('Ingen spillere i spillet');
    }

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

  async resolveAttackAndAdvanceTurn(
    sessionId: string,
    targetPlayerId: string,
    getCardById: (id: string) => Card
  ): Promise<void> {
    const roundState = await this.getRoundState(sessionId);
    if (!roundState || !roundState.pendingAttack || !roundState.pendingAttackCardId) {
      throw new Error('Ingen aktivt angrep å resolvere');
    }

    if (roundState.pendingAttackToPlayerId !== targetPlayerId) {
      throw new Error('Dette angrepet er ikke på denne spilleren');
    }

    const card = getCardById(roundState.pendingAttackCardId);

    const { data: effects, error: effError } = await this.supabase.client
      .from('player_effects')
      .select('*')
      .eq('session_id', sessionId)
      .eq('player_id', targetPlayerId);

    if (effError) {
      console.error('Feil ved henting av effekter:', effError);
      throw effError;
    }

    const defenceEffects = (effects ?? []).filter((e) => e.effect_type === 'defence');
    const curseEffects = (effects ?? []).filter((e) => e.effect_type === 'curse');

    let total = card.drinkAmount;
    total += curseEffects.length;
    total -= defenceEffects.length;
    if (total < 0) total = 0;

    const { data: target, error: targetError } = await this.supabase.client
      .from('players')
      .select('*')
      .eq('id', targetPlayerId)
      .single();

    if (targetError || !target) {
      console.error('Feil ved henting av target player:', targetError);
      throw targetError ?? new Error('Fant ikke spiller');
    }

    const newLives = Math.max(0, (target.lives ?? 0) - total);

    const { error: livesError } = await this.supabase.client
      .from('players')
      .update({ lives: newLives })
      .eq('id', targetPlayerId);

    if (livesError) {
      console.error('Feil ved oppdatering av liv:', livesError);
      throw livesError;
    }

    const effIdsToDelete = (effects ?? []).map((e) => e.id);
    if (effIdsToDelete.length > 0) {
      const { error: delError } = await this.supabase.client
        .from('player_effects')
        .delete()
        .in('id', effIdsToDelete);

      if (delError) {
        console.error('Feil ved sletting av effekter:', delError);
      }
    }

    const nextIndex =
      roundState.turnOrder.length === 0
        ? 0
        : (roundState.currentTurnIndex + 1) % roundState.turnOrder.length;

    const { error: rsError } = await this.supabase.client
      .from('round_state')
      .update({
        pending_attack: false,
        pending_attack_card_id: null,
        pending_attack_from_player_id: null,
        pending_attack_to_player_id: null,
        current_turn_index: nextIndex,
      })
      .eq('session_id', sessionId);

    if (rsError) {
      console.error('Feil ved oppdatering av round_state etter resolusjon:', rsError);
      throw rsError;
    }
  }

  // game-session.service.ts

  async advanceTurn(sessionId: string): Promise<void> {
    const roundState = await this.getRoundState(sessionId);
    if (!roundState) {
      throw new Error('Ingen round_state for session');
    }

    if (!roundState.turnOrder.length) {
      return;
    }

    const nextIndex = (roundState.currentTurnIndex + 1) % roundState.turnOrder.length;

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
}
