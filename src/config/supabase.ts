
import { createClient } from '@supabase/supabase-js';

// Credentials provided by the user
const supabaseUrl = 'https://vqvfdqtzrnhsfeafwrua.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxdmZkcXR6cm5oc2ZlYWZ3cnVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Mzc2MjAsImV4cCI6MjA4NjMxMzYyMH0.G_8Yw6GGhik9qvgh36dnjDTTrG5iy9Tei5_uA9Vb3JQ';

export const supabase = createClient(supabaseUrl, supabaseKey);
