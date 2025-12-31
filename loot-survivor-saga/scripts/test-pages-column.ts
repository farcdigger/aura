// scripts/test-pages-column.ts
// Test script to verify pages column in Supabase

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testPagesColumn() {
  console.log('🔍 Testing pages column in Supabase...\n');
  
  // 1. Check if column exists
  console.log('1️⃣ Checking if pages column exists...');
  const { data: columns, error: columnsError } = await supabase
    .from('sagas')
    .select('*')
    .limit(1);
  
  if (columnsError) {
    console.error('❌ Error checking columns:', columnsError);
    return;
  }
  
  console.log('✅ Columns check passed\n');
  
  // 2. Find a completed saga
  console.log('2️⃣ Finding a completed saga...');
  const { data: completedSaga, error: findError } = await supabase
    .from('sagas')
    .select('id, status, pages, total_pages')
    .eq('status', 'completed')
    .not('pages', 'is', null)
    .limit(1)
    .single();
  
  if (findError || !completedSaga) {
    console.warn('⚠️ No completed saga with pages found. Creating test data...');
    
    // Create a test saga with pages
    const testPages = [
      {
        pageNumber: 1,
        pageImageUrl: 'https://test.com/image1.jpg',
        panels: [{ panelNumber: 1, speechBubble: 'Test' }]
      }
    ];
    
    const { data: testSaga, error: testError } = await supabase
      .from('sagas')
      .insert({
        game_id: 'test-123',
        user_wallet: 'test-wallet',
        status: 'completed',
        pages: testPages,
        total_pages: 1
      })
      .select('id, pages, total_pages')
      .single();
    
    if (testError || !testSaga) {
      console.error('❌ Error creating test saga:', testError);
      return;
    }
    
    console.log('✅ Test saga created:', {
      id: testSaga.id,
      hasPages: !!testSaga.pages,
      pagesType: typeof testSaga.pages,
      pagesIsArray: Array.isArray(testSaga.pages),
      pagesLength: Array.isArray(testSaga.pages) ? testSaga.pages.length : 0
    });
    
    // Now fetch it back
    const { data: fetchedSaga, error: fetchError } = await supabase
      .from('sagas')
      .select('id, pages, total_pages, status')
      .eq('id', testSaga.id)
      .single();
    
    if (fetchError || !fetchedSaga) {
      console.error('❌ Error fetching test saga:', fetchError);
      return;
    }
    
    console.log('\n3️⃣ Fetched test saga:', {
      id: fetchedSaga.id,
      hasPages: !!fetchedSaga.pages,
      pagesType: typeof fetchedSaga.pages,
      pagesIsNull: fetchedSaga.pages === null,
      pagesIsUndefined: fetchedSaga.pages === undefined,
      pagesIsArray: Array.isArray(fetchedSaga.pages),
      pagesLength: Array.isArray(fetchedSaga.pages) ? fetchedSaga.pages.length : 0,
      status: fetchedSaga.status
    });
    
    // Clean up
    await supabase.from('sagas').delete().eq('id', testSaga.id);
    console.log('✅ Test saga cleaned up');
    
    return;
  }
  
  console.log('✅ Found completed saga:', {
    id: completedSaga.id,
    status: completedSaga.status,
    hasPages: !!completedSaga.pages,
    pagesType: typeof completedSaga.pages,
    total_pages: completedSaga.total_pages
  });
  
  // 3. Fetch it again with explicit select
  console.log('\n3️⃣ Fetching again with explicit select...');
  const { data: fetchedSaga, error: fetchError } = await supabase
    .from('sagas')
    .select('id, pages, total_pages, status')
    .eq('id', completedSaga.id)
    .single();
  
  if (fetchError || !fetchedSaga) {
    console.error('❌ Error fetching saga:', fetchError);
    return;
  }
  
  console.log('✅ Fetched saga:', {
    id: fetchedSaga.id,
    hasPages: !!fetchedSaga.pages,
    pagesType: typeof fetchedSaga.pages,
    pagesIsNull: fetchedSaga.pages === null,
    pagesIsUndefined: fetchedSaga.pages === undefined,
    pagesIsArray: Array.isArray(fetchedSaga.pages),
    pagesLength: Array.isArray(fetchedSaga.pages) ? fetchedSaga.pages.length : 0,
    status: fetchedSaga.status
  });
  
  // 4. Try to update it
  console.log('\n4️⃣ Testing update...');
  const updatePages = [
    {
      pageNumber: 1,
      pageImageUrl: 'https://test.com/updated.jpg',
      panels: [{ panelNumber: 1, speechBubble: 'Updated' }]
    }
  ];
  
  const { data: updatedSaga, error: updateError } = await supabase
    .from('sagas')
    .update({ pages: updatePages, total_pages: 1 })
    .eq('id', completedSaga.id)
    .select('id, pages, total_pages')
    .single();
  
  if (updateError || !updatedSaga) {
    console.error('❌ Error updating saga:', updateError);
    return;
  }
  
  console.log('✅ Updated saga:', {
    id: updatedSaga.id,
    hasPages: !!updatedSaga.pages,
    pagesType: typeof updatedSaga.pages,
    pagesIsArray: Array.isArray(updatedSaga.pages),
    pagesLength: Array.isArray(updatedSaga.pages) ? updatedSaga.pages.length : 0
  });
  
  // Restore original
  await supabase
    .from('sagas')
    .update({ pages: completedSaga.pages, total_pages: completedSaga.total_pages })
    .eq('id', completedSaga.id);
  
  console.log('✅ Original data restored');
}

testPagesColumn()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });


