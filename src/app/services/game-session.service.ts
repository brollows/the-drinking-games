import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

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
}

@Injectable({
  providedIn: 'root',
})
export class GameSessionService {
  private _currentSession: GameSession | null = null;
  private _currentPlayer: Player | null = null;

  constructor(private supabase: SupabaseService) { }

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
      phase: session.phase
    };

    this._currentSession = newSession;

    // 2) Registrer host som player i `players`
    const { data: player, error: playerError } = await this.supabase.client
      .from('players')
      .insert({
        name: hostName,
        is_host: true,
        session_id: session.id,
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
      phase: session.phase
    };

    this._currentSession = joinedSession;

    // 2) Opprett player i `players`
    const { data: player, error: playerError } = await this.supabase.client
      .from('players')
      .insert({
        name: trimmedName,
        is_host: false,
        session_id: session.id,
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

}
