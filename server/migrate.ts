import pg from 'pg';

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  console.log('Running database migrations...');
  
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  await client.connect();
  
  try {
    // Check and add events_slug_unique constraint if it doesn't exist
    const constraintCheck = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'events' 
      AND constraint_name = 'events_slug_unique'
    `);
    
    if (constraintCheck.rows.length === 0) {
      console.log('Adding events_slug_unique constraint...');
      try {
        await client.query(`
          ALTER TABLE events 
          ADD CONSTRAINT events_slug_unique UNIQUE (slug)
        `);
        console.log('Constraint added successfully.');
      } catch (e: any) {
        if (e.code === '23505') {
          console.log('Cannot add unique constraint: duplicate values exist. Skipping.');
        } else if (e.code === '42710') {
          console.log('Constraint already exists.');
        } else {
          throw e;
        }
      }
    } else {
      console.log('events_slug_unique constraint already exists.');
    }
    
    console.log('Migrations complete!');
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error('Schema push failed:', err);
  process.exit(1);
});
