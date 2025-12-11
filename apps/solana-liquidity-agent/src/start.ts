/**
 * Railway Start Script - Starts both API server and worker
 * This script manages both processes and handles graceful shutdown
 */

console.log('🚀 Starting Solana Liquidity Agent...');
console.log('📡 Starting API server...');
console.log('⚙️  Starting worker...');

// Get the project root directory (parent of src/)
const projectRoot = process.cwd();

// Start API server
const apiProcess = Bun.spawn(['bun', 'run', 'src/index.ts'], {
  cwd: projectRoot,
  stdio: ['inherit', 'inherit', 'inherit'],
  env: { ...process.env },
});

// Start worker
const workerProcess = Bun.spawn(['bun', 'run', 'src/worker.ts'], {
  cwd: projectRoot,
  stdio: ['inherit', 'inherit', 'inherit'],
  env: { ...process.env },
});

// Handle process exits
const handleExit = (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    apiProcess.kill(signal as any);
    workerProcess.kill(signal as any);
  } catch (error) {
    console.error('Error killing processes:', error);
  }
  
  // Force kill after 10 seconds
  setTimeout(() => {
    console.log('⚠️  Force killing processes...');
    try {
      apiProcess.kill();
      workerProcess.kill();
    } catch (error) {
      console.error('Error force killing:', error);
    }
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => handleExit('SIGTERM'));
process.on('SIGINT', () => handleExit('SIGINT'));

// Handle process exits
apiProcess.exited.then((exitCode) => {
  console.error(`❌ API process exited with code ${exitCode}`);
  if (exitCode !== 0) {
    try {
      workerProcess.kill();
    } catch (error) {
      console.error('Error killing worker:', error);
    }
    process.exit(exitCode);
  }
}).catch((error) => {
  console.error('❌ API process error:', error);
  try {
    workerProcess.kill();
  } catch (killError) {
    console.error('Error killing worker:', killError);
  }
  process.exit(1);
});

workerProcess.exited.then((exitCode) => {
  console.error(`❌ Worker process exited with code ${exitCode}`);
  if (exitCode !== 0) {
    try {
      apiProcess.kill();
    } catch (error) {
      console.error('Error killing API:', error);
    }
    process.exit(exitCode);
  }
}).catch((error) => {
  console.error('❌ Worker process error:', error);
  try {
    apiProcess.kill();
  } catch (killError) {
    console.error('Error killing API:', killError);
  }
  process.exit(1);
});

console.log('✅ Both processes started successfully');
console.log('📊 Monitoring processes...');

