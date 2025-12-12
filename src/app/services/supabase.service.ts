import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private static hasTestedConnection = false;

  constructor() {
    const supabaseUrl = 'https://guxojebtwtjblcnijcfi.supabase.co';
    const supabaseKey = 'sb_publishable_g-YrFqCrsofmPLVmjmTCzA_xO6QtSvi';

    this.supabase = createClient(supabaseUrl, supabaseKey);

    this.testConnectionOnce();
  }

  get client() {
    return this.supabase;
  }

  private async testConnectionOnce() {
    if (SupabaseService.hasTestedConnection) return;
    SupabaseService.hasTestedConnection = true;

    console.log('Tester Supabase connection...');

    const { error } = await this.supabase.from('game_sessions').select('*').limit(1);

    if (error) {
      console.error('Supabase ERROR:', error);
    } else {
      console.log('Supabase OK!');
    }
  }
}
