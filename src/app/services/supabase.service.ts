import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable({
    providedIn: 'root',
})
export class SupabaseService {
    private supabase: SupabaseClient;

    constructor() {
        const supabaseUrl = 'https://guxojebtwtjblcnijcfi.supabase.co'; // bytt ut
        const supabaseKey = 'sb_publishable_g-YrFqCrsofmPLVmjmTCzA_xO6QtSvi';

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    get client() {
        return this.supabase;
    }
}
