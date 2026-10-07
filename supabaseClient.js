// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://nahtrvdxavbmxxsluebn.supabase.co';
const supabaseKey = 'sb_publishable_tGyvr0C9deXUZKFmjqK48g_TYE2mErs';

export const supabase = createClient(supabaseUrl, supabaseKey);