import { execSync } from 'child_process';

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  console.log('Pushing schema to database...');
  
  execSync('npx drizzle-kit push --force', { 
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  console.log('Schema push complete!');
}

runMigrations().catch((err) => {
  console.error('Schema push failed:', err);
  process.exit(1);
});
