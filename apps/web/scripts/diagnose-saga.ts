// Diagnostic script to check saga generation issues
// Run with: npx tsx apps/web/scripts/diagnose-saga.ts <sagaId>

import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local file
config({ path: resolve(process.cwd(), '.env.local') });

const sagaId = process.argv[2];

if (!sagaId) {
  console.error('❌ Please provide a saga ID: npx tsx apps/web/scripts/diagnose-saga.ts <sagaId>');
  process.exit(1);
}

async function diagnose() {
  console.log(`\n🔍 Diagnosing saga: ${sagaId}\n`);

  // 1. Check Supabase
  console.log('📊 1. Checking Supabase...');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not found in environment');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: saga, error: sagaError } = await supabase
    .from('sagas')
    .select('*')
    .eq('id', sagaId)
    .single();

  if (sagaError) {
    console.error('❌ Saga not found in Supabase:', sagaError.message);
  } else {
    console.log('✅ Saga found in Supabase:');
    console.log('   - ID:', saga.id);
    console.log('   - Game ID:', saga.game_id);
    console.log('   - Status:', saga.status);
    console.log('   - Progress:', saga.progress_percent, '%');
    console.log('   - Current Step:', saga.current_step);
    console.log('   - Created At:', saga.created_at);
    console.log('   - Updated At:', (saga as any).updated_at || saga.created_at);
    console.log('   - Has Pages:', !!saga.pages);
    console.log('   - Pages Type:', typeof saga.pages);
    console.log('   - Pages Is Array:', Array.isArray(saga.pages));
    console.log('   - Pages Length:', Array.isArray(saga.pages) ? saga.pages.length : 'N/A');
    console.log('   - Total Pages:', saga.total_pages);
    console.log('   - Total Panels:', saga.total_panels);
    
    if (saga.pages && Array.isArray(saga.pages) && saga.pages.length > 0) {
      console.log('   - First Page Image URL:', (saga.pages[0] as any)?.pageImageUrl?.substring(0, 50) + '...' || 'null');
    }
  }

  // 2. Check Job Queue
  console.log('\n📊 2. Checking Job Queue...');
  const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.error('❌ Redis URL not found in environment');
    return;
  }

  const redis = new Redis(redisUrl);
  const sagaQueue = new Queue('saga-generation', { connection: redis });

  const waitingJobs = await sagaQueue.getJobs(['waiting']);
  const activeJobs = await sagaQueue.getJobs(['active']);
  const completedJobs = await sagaQueue.getJobs(['completed'], 0, 10);
  const failedJobs = await sagaQueue.getJobs(['failed'], 0, 10);

  console.log('   - Waiting Jobs:', waitingJobs.length);
  console.log('   - Active Jobs:', activeJobs.length);
  console.log('   - Completed Jobs (last 10):', completedJobs.length);
  console.log('   - Failed Jobs (last 10):', failedJobs.length);

  // Find job for this saga
  const allJobs = [...waitingJobs, ...activeJobs, ...completedJobs, ...failedJobs];
  const sagaJob = allJobs.find(job => job.data.sagaId === sagaId || job.id === sagaId);

  if (sagaJob) {
    console.log('✅ Job found in queue:');
    console.log('   - Job ID:', sagaJob.id);
    console.log('   - Job Name:', sagaJob.name);
    console.log('   - Job State:', await sagaJob.getState());
    console.log('   - Job Data:', JSON.stringify(sagaJob.data, null, 2));
    console.log('   - Job Progress:', sagaJob.progress);
    console.log('   - Attempts Made:', sagaJob.attemptsMade);
    console.log('   - Failed Reason:', sagaJob.failedReason || 'N/A');
  } else {
    console.log('❌ Job not found in queue for saga:', sagaId);
    console.log('   - Searching by game_id...');
    
    if (saga) {
      const gameIdJobs = allJobs.filter(job => job.data.gameId === saga.game_id);
      if (gameIdJobs.length > 0) {
        console.log(`   - Found ${gameIdJobs.length} job(s) with game_id ${saga.game_id}:`);
        gameIdJobs.forEach(job => {
          console.log(`     - Job ID: ${job.id}, Saga ID: ${job.data.sagaId}, State: ${job.getState()}`);
        });
      } else {
        console.log('   - No jobs found with matching game_id');
      }
    }
  }

  // 3. Check if saga is stuck
  console.log('\n📊 3. Checking if saga is stuck...');
  if (saga) {
    const now = Date.now();
    const updatedAt = new Date((saga as any).updated_at || saga.created_at).getTime();
    const secondsSinceUpdate = (now - updatedAt) / 1000;
    
    console.log('   - Last Update:', new Date((saga as any).updated_at || saga.created_at).toISOString());
    console.log('   - Seconds Since Update:', Math.floor(secondsSinceUpdate));
    
    if (saga.status === 'generating_images' && secondsSinceUpdate > 300) {
      console.log('   ⚠️  Saga appears to be stuck (no update in 5+ minutes)');
    } else if (saga.status === 'generating_images' && secondsSinceUpdate < 60) {
      console.log('   ✅ Saga is actively being processed');
    }
  }

  // 4. Recommendations
  console.log('\n💡 Recommendations:');
  if (saga && saga.status === 'generating_images' && !saga.pages) {
    console.log('   - Saga is in generating_images but has no pages');
    console.log('   - This suggests image generation started but did not complete');
    console.log('   - Check Vercel logs for image generation errors');
  }
  
  if (sagaJob && await sagaJob.getState() === 'active') {
    console.log('   - Job is active but saga is not updating');
    console.log('   - This suggests the worker is stuck or crashed');
  }

  if (!sagaJob && saga && saga.status !== 'completed') {
    console.log('   - Saga exists but no job in queue');
    console.log('   - This suggests the job was removed or never created');
  }

  await redis.quit();
  console.log('\n✅ Diagnosis complete\n');
}

diagnose().catch(console.error);

