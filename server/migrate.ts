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
    
    // Add guest_policy column if it doesn't exist
    const guestPolicyCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'guest_policy'
    `);
    
    if (guestPolicyCheck.rows.length === 0) {
      console.log('Adding guest_policy column...');
      await client.query(`
        ALTER TABLE events 
        ADD COLUMN guest_policy text NOT NULL DEFAULT 'not_allowed'
      `);
      
      // Backfill: if buyInPrice > 0, set to allowed_paid
      await client.query(`
        UPDATE events 
        SET guest_policy = 'allowed_paid' 
        WHERE buy_in_price IS NOT NULL AND buy_in_price > 0
      `);
      console.log('guest_policy column added and backfilled.');
    } else {
      console.log('guest_policy column already exists.');
    }
    
    // Create guest_allowance_rules table if it doesn't exist
    const rulesTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'guest_allowance_rules'
    `);
    
    if (rulesTableCheck.rows.length === 0) {
      console.log('Creating guest_allowance_rules table...');
      await client.query(`
        CREATE TABLE guest_allowance_rules (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          event_id varchar REFERENCES events(id) NOT NULL,
          name text NOT NULL,
          name_es text,
          description text,
          description_es text,
          free_guest_count integer NOT NULL DEFAULT 0,
          max_paid_guests integer DEFAULT 0,
          paid_guest_price_cents integer,
          is_default boolean DEFAULT false,
          sort_order integer DEFAULT 0,
          created_at timestamp DEFAULT now() NOT NULL,
          last_modified timestamp DEFAULT now() NOT NULL
        )
      `);
      console.log('guest_allowance_rules table created.');
    } else {
      console.log('guest_allowance_rules table already exists.');
    }
    
    // Add guest allowance columns to qualified_registrants if they don't exist
    const qualifiedRuleIdCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'qualified_registrants' 
      AND column_name = 'guest_allowance_rule_id'
    `);
    
    if (qualifiedRuleIdCheck.rows.length === 0) {
      console.log('Adding guest allowance columns to qualified_registrants...');
      await client.query(`
        ALTER TABLE qualified_registrants 
        ADD COLUMN guest_allowance_rule_id varchar REFERENCES guest_allowance_rules(id),
        ADD COLUMN free_guest_override integer,
        ADD COLUMN max_paid_guest_override integer,
        ADD COLUMN guest_price_override integer
      `);
      console.log('Guest allowance columns added to qualified_registrants.');
    } else {
      console.log('Guest allowance columns already exist in qualified_registrants.');
    }
    
    // Add isComplimentary and amountPaidCents columns to guests if they don't exist
    const guestsComplimentaryCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'guests' 
      AND column_name = 'is_complimentary'
    `);
    
    if (guestsComplimentaryCheck.rows.length === 0) {
      console.log('Adding complimentary tracking columns to guests...');
      await client.query(`
        ALTER TABLE guests 
        ADD COLUMN is_complimentary boolean DEFAULT false,
        ADD COLUMN amount_paid_cents integer
      `);
      console.log('Complimentary tracking columns added to guests.');
    } else {
      console.log('Complimentary tracking columns already exist in guests.');
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
