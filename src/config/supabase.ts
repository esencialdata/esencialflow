
import { createClient } from '@supabase/supabase-js';

// Credentials provided by the user
const supabaseUrl = 'https://vqvfdqtzrnhsfeafwrua.supabase.co';
const supabaseKey = 'sb_publishable_IZR6fwz-RaunSBndbtgkcA_ooA9Cnka';

export const supabase = createClient(supabaseUrl, supabaseKey);
