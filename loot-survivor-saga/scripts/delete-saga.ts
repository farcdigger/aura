// scripts/delete-saga.ts
// Test için mevcut saga'yı sil

import { supabase } from '../src/lib/database/supabase';

async function deleteSaga() {
  const gameId = process.argv[2] || '133595';
  
  console.log(`🗑️ Deleting saga for game ID: ${gameId}`);
  
  const { data, error } = await supabase
    .from('sagas')
    .delete()
    .eq('game_id', gameId)
    .select();
  
  if (error) {
    console.error('❌ Error deleting saga:', error);
    process.exit(1);
  }
  
  console.log(`✅ Deleted ${data?.length || 0} saga(s) for game ${gameId}`);
}

deleteSaga();


