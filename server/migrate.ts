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
    
    // Create form_templates table if it doesn't exist
    const formTemplatesTableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'form_templates'
    `);
    
    if (formTemplatesTableCheck.rows.length === 0) {
      console.log('Creating form_templates table...');
      await client.query(`
        CREATE TABLE form_templates (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          key text NOT NULL UNIQUE,
          name text NOT NULL,
          name_es text,
          description text,
          description_es text,
          fields jsonb NOT NULL,
          is_default boolean DEFAULT false,
          created_at timestamp DEFAULT now() NOT NULL,
          last_modified timestamp DEFAULT now() NOT NULL
        )
      `);
      console.log('form_templates table created.');
      
      // Seed the predefined templates
      console.log('Seeding predefined form templates...');
      
      // Success Trip template
      const successTripFields = JSON.stringify([
        {"name":"unicityId","type":"text","label":"Distributor ID","locked":true,"labelEs":"ID de Distribuidor","required":true},
        {"name":"email","type":"email","label":"Email Address","labelEs":"Correo Electrónico","editable":true,"required":true},
        {"name":"firstName","type":"text","label":"First Name (as shown on passport)","labelEs":"Nombre (como aparece en el pasaporte)","editable":true,"required":true},
        {"name":"lastName","type":"text","label":"Last Name(s) (as shown on passport)","labelEs":"Apellido(s) (como aparece en el pasaporte)","editable":true,"required":true},
        {"name":"phone","type":"tel","label":"Mobile Number","labelEs":"Número de Celular","editable":true,"required":true},
        {"name":"gender","type":"select","label":"Gender","labelEs":"Género","options":[{"label":"Female","value":"female","labelEs":"Femenino"},{"label":"Male","value":"male","labelEs":"Masculino"}],"required":true},
        {"name":"dateOfBirth","type":"date","label":"Date of Birth","labelEs":"Fecha de Nacimiento","required":true},
        {"name":"passportNumber","type":"text","label":"Passport Number","labelEs":"Número de Pasaporte","required":true},
        {"name":"passportCountry","type":"text","label":"Passport Country","labelEs":"País del Pasaporte","required":true},
        {"name":"passportExpiration","type":"date","label":"Passport Expiration","labelEs":"Vencimiento del Pasaporte","required":true},
        {"name":"emergencyContact","type":"text","label":"Emergency Contact","labelEs":"Contacto de Emergencia","required":true},
        {"name":"emergencyContactPhone","type":"tel","label":"Emergency Contact Mobile","labelEs":"Celular de Contacto de Emergencia","required":true},
        {"name":"shirtSize","type":"select","label":"T-Shirt Size","labelEs":"Talla de Camiseta","options":[{"label":"Womens - XS","value":"womens-xs"},{"label":"Womens - Small","value":"womens-s"},{"label":"Womens - Medium","value":"womens-m"},{"label":"Womens - Large","value":"womens-l"},{"label":"Womens - XL","value":"womens-xl"},{"label":"Womens - 2XL","value":"womens-2xl"},{"label":"Womens - 3XL","value":"womens-3xl"},{"label":"Womens - 4XL","value":"womens-4xl"},{"label":"Mens - XS","value":"mens-xs"},{"label":"Mens - Small","value":"mens-s"},{"label":"Mens - Medium","value":"mens-m"},{"label":"Mens - Large","value":"mens-l"},{"label":"Mens - XL","value":"mens-xl"},{"label":"Mens - 2XL","value":"mens-2xl"},{"label":"Mens - 3XL","value":"mens-3xl"},{"label":"Mens - 4XL","value":"mens-4xl"}],"required":true},
        {"name":"pantSize","type":"select","label":"Pant Size","labelEs":"Talla de Pantalón","options":[{"label":"Womens - XS","value":"womens-xs"},{"label":"Womens - Small","value":"womens-s"},{"label":"Womens - Medium","value":"womens-m"},{"label":"Womens - Large","value":"womens-l"},{"label":"Womens - XL","value":"womens-xl"},{"label":"Womens - 2XL","value":"womens-2xl"},{"label":"Womens - 3XL","value":"womens-3xl"},{"label":"Womens - 4XL","value":"womens-4xl"},{"label":"Mens - XS","value":"mens-xs"},{"label":"Mens - Small","value":"mens-s"},{"label":"Mens - Medium","value":"mens-m"},{"label":"Mens - Large","value":"mens-l"},{"label":"Mens - XL","value":"mens-xl"},{"label":"Mens - 2XL","value":"mens-2xl"},{"label":"Mens - 3XL","value":"mens-3xl"},{"label":"Mens - 4XL","value":"mens-4xl"}],"required":true},
        {"name":"dietaryRestrictions","type":"multiselect","label":"Dietary Restrictions","labelEs":"Restricciones Alimenticias","options":[{"label":"None","value":"none","labelEs":"Ninguna"},{"label":"Vegan","value":"vegan","labelEs":"Vegano"},{"label":"Vegetarian","value":"vegetarian","labelEs":"Vegetariano"},{"label":"Allergy to Shellfish","value":"shellfish-allergy","labelEs":"Alergia a Mariscos"},{"label":"Allergic to Seafood","value":"seafood-allergy","labelEs":"Alergia a Pescado"},{"label":"No Pork","value":"no-pork","labelEs":"Sin Cerdo"},{"label":"No Chicken","value":"no-chicken","labelEs":"Sin Pollo"},{"label":"Dairy Free","value":"dairy-free","labelEs":"Sin Lácteos"},{"label":"Gluten Free","value":"gluten-free","labelEs":"Sin Gluten"},{"label":"No Red Meat","value":"no-red-meat","labelEs":"Sin Carne Roja"},{"label":"Halal","value":"halal"},{"label":"Kosher","value":"kosher"},{"label":"Keto","value":"keto"},{"label":"Allergic to Nuts","value":"nut-allergy","labelEs":"Alergia a Nueces"}],"required":false},
        {"name":"adaAccommodations","type":"select","label":"ADA Accommodations?","labelEs":"Necesita Acomodaciones ADA?","options":[{"label":"No","value":"no"},{"label":"Yes","value":"yes","labelEs":"Sí"}],"required":true},
        {"name":"roomType","type":"select","label":"Room Type","labelEs":"Tipo de Habitación","options":[{"label":"One King Bed","value":"one-king","labelEs":"Una Cama King"},{"label":"Two Queen Beds","value":"two-queens","labelEs":"Dos Camas Queen"}],"required":true},
        {"name":"termsAccepted","type":"checkbox","label":"By checking this box, I acknowledge and accept all terms outlined in the event waiver.","labelEs":"Al marcar esta casilla, reconozco y acepto todos los términos descritos en la exención del evento.","required":true,"waiverUrl":"https://drive.google.com/file/d/1yYXgsMzkE0kjVd-7-Bo5LWLH7wNpEyp1/view"}
      ]);
      
      await client.query(`
        INSERT INTO form_templates (key, name, name_es, description, description_es, fields, is_default)
        VALUES ('success_trip', 'Success Trip', 'Viaje de Éxito', 'Registration form for success trips with passport, clothing sizes, and dietary requirements', 'Formulario de registro para viajes de éxito con pasaporte, tallas de ropa y requisitos dietéticos', $1::jsonb, true)
      `, [successTripFields]);
      
      // Method template
      const methodFields = JSON.stringify([
        {"name":"unicityId","type":"text","label":"Distributor ID","locked":true,"labelEs":"ID de Distribuidor","required":true},
        {"name":"email","type":"email","label":"Email Address","labelEs":"Correo Electrónico","editable":true,"required":true},
        {"name":"firstName","type":"text","label":"First Name","labelEs":"Nombre","editable":true,"required":true},
        {"name":"lastName","type":"text","label":"Last Name","labelEs":"Apellido","editable":true,"required":true},
        {"name":"preferredLanguage","type":"select","label":"What language would you prefer?","labelEs":"¿Qué idioma prefiere?","options":[{"label":"English","value":"english","labelEs":"Inglés"},{"label":"Spanish","value":"spanish","labelEs":"Español"},{"label":"French","value":"french","labelEs":"Francés"}],"required":true},
        {"name":"firstMethodAttending","type":"select","label":"Is this the first Method you are attending?","labelEs":"¿Es este el primer Method al que asiste?","options":[{"label":"Yes","value":"yes","labelEs":"Sí"},{"label":"No","value":"no"}],"required":true},
        {"name":"vegetarianVeganOptions","type":"text","label":"Vegetarian or Vegan Options","labelEs":"Opciones Vegetarianas o Veganas","required":false},
        {"name":"headphonesAccommodationAcknowledgment","type":"checkbox","label":"I know that I am responsible for bringing my own headphones and I am also responsible for arranging my own accommodation for the trip.","labelEs":"Sé que soy responsable de traer mis propios auriculares y también soy responsable de organizar mi propio alojamiento para el viaje.","required":true},
        {"name":"cancellationFeeAgreement","type":"checkbox","label":"By checking this box, I agree that $200 will be deductible from my commission if I register and don't attend the seminar or cancel by the deadline.","labelEs":"Al marcar esta casilla, acepto que se deducirán $200 de mi comisión si me registro y no asisto al seminario o cancelo antes de la fecha límite.","required":true},
        {"name":"releaseForms","type":"checkbox","label":"By checking this box, I agree to our Breathing Exercises Release Form and Accept our Agreement To Not Share.","labelEs":"Al marcar esta casilla, acepto nuestro Formulario de Liberación de Ejercicios de Respiración y Acepto nuestro Acuerdo de No Compartir.","required":true,"waiverUrl":"https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:c859aee0-0bf6-4650-9b68-a151cb235992","secondaryWaiverUrl":"https://docs.google.com/document/d/10oJqzlVD3t_2atZKSEdnmYfwmLwpufCg/edit"}
      ]);
      
      await client.query(`
        INSERT INTO form_templates (key, name, name_es, description, description_es, fields, is_default)
        VALUES ('method', 'Method', 'Método', 'Registration form for Method seminars with language preference and acknowledgments', 'Formulario de registro para seminarios Method con preferencia de idioma y reconocimientos', $1::jsonb, false)
      `, [methodFields]);
      
      console.log('form_templates table created.');
    } else {
      console.log('form_templates table already exists.');
    }
    
    // Always upsert predefined form templates (runs on every migration)
    console.log('Upserting predefined form templates...');
    
    // Success Trip template
    const successTripFieldsUpsert = JSON.stringify([
      {"name":"unicityId","type":"text","label":"Distributor ID","locked":true,"labelEs":"ID de Distribuidor","required":true},
      {"name":"email","type":"email","label":"Email Address","labelEs":"Correo Electrónico","editable":true,"required":true},
      {"name":"firstName","type":"text","label":"First Name (as shown on passport)","labelEs":"Nombre (como aparece en el pasaporte)","editable":true,"required":true},
      {"name":"lastName","type":"text","label":"Last Name(s) (as shown on passport)","labelEs":"Apellido(s) (como aparece en el pasaporte)","editable":true,"required":true},
      {"name":"phone","type":"tel","label":"Mobile Number","labelEs":"Número de Celular","editable":true,"required":true},
      {"name":"gender","type":"select","label":"Gender","labelEs":"Género","options":[{"label":"Female","value":"female","labelEs":"Femenino"},{"label":"Male","value":"male","labelEs":"Masculino"}],"required":true},
      {"name":"dateOfBirth","type":"date","label":"Date of Birth","labelEs":"Fecha de Nacimiento","required":true},
      {"name":"passportNumber","type":"text","label":"Passport Number","labelEs":"Número de Pasaporte","required":true},
      {"name":"passportCountry","type":"text","label":"Passport Country","labelEs":"País del Pasaporte","required":true},
      {"name":"passportExpiration","type":"date","label":"Passport Expiration","labelEs":"Vencimiento del Pasaporte","required":true},
      {"name":"emergencyContact","type":"text","label":"Emergency Contact","labelEs":"Contacto de Emergencia","required":true},
      {"name":"emergencyContactPhone","type":"tel","label":"Emergency Contact Mobile","labelEs":"Celular de Contacto de Emergencia","required":true},
      {"name":"shirtSize","type":"select","label":"T-Shirt Size","labelEs":"Talla de Camiseta","options":[{"label":"Womens - XS","value":"womens-xs"},{"label":"Womens - Small","value":"womens-s"},{"label":"Womens - Medium","value":"womens-m"},{"label":"Womens - Large","value":"womens-l"},{"label":"Womens - XL","value":"womens-xl"},{"label":"Womens - 2XL","value":"womens-2xl"},{"label":"Womens - 3XL","value":"womens-3xl"},{"label":"Womens - 4XL","value":"womens-4xl"},{"label":"Mens - XS","value":"mens-xs"},{"label":"Mens - Small","value":"mens-s"},{"label":"Mens - Medium","value":"mens-m"},{"label":"Mens - Large","value":"mens-l"},{"label":"Mens - XL","value":"mens-xl"},{"label":"Mens - 2XL","value":"mens-2xl"},{"label":"Mens - 3XL","value":"mens-3xl"},{"label":"Mens - 4XL","value":"mens-4xl"}],"required":true},
      {"name":"pantSize","type":"select","label":"Pant Size","labelEs":"Talla de Pantalón","options":[{"label":"Womens - XS","value":"womens-xs"},{"label":"Womens - Small","value":"womens-s"},{"label":"Womens - Medium","value":"womens-m"},{"label":"Womens - Large","value":"womens-l"},{"label":"Womens - XL","value":"womens-xl"},{"label":"Womens - 2XL","value":"womens-2xl"},{"label":"Womens - 3XL","value":"womens-3xl"},{"label":"Womens - 4XL","value":"womens-4xl"},{"label":"Mens - XS","value":"mens-xs"},{"label":"Mens - Small","value":"mens-s"},{"label":"Mens - Medium","value":"mens-m"},{"label":"Mens - Large","value":"mens-l"},{"label":"Mens - XL","value":"mens-xl"},{"label":"Mens - 2XL","value":"mens-2xl"},{"label":"Mens - 3XL","value":"mens-3xl"},{"label":"Mens - 4XL","value":"mens-4xl"}],"required":true},
      {"name":"dietaryRestrictions","type":"multiselect","label":"Dietary Restrictions","labelEs":"Restricciones Alimenticias","options":[{"label":"None","value":"none","labelEs":"Ninguna"},{"label":"Vegan","value":"vegan","labelEs":"Vegano"},{"label":"Vegetarian","value":"vegetarian","labelEs":"Vegetariano"},{"label":"Allergy to Shellfish","value":"shellfish-allergy","labelEs":"Alergia a Mariscos"},{"label":"Allergic to Seafood","value":"seafood-allergy","labelEs":"Alergia a Pescado"},{"label":"No Pork","value":"no-pork","labelEs":"Sin Cerdo"},{"label":"No Chicken","value":"no-chicken","labelEs":"Sin Pollo"},{"label":"Dairy Free","value":"dairy-free","labelEs":"Sin Lácteos"},{"label":"Gluten Free","value":"gluten-free","labelEs":"Sin Gluten"},{"label":"No Red Meat","value":"no-red-meat","labelEs":"Sin Carne Roja"},{"label":"Halal","value":"halal"},{"label":"Kosher","value":"kosher"},{"label":"Keto","value":"keto"},{"label":"Allergic to Nuts","value":"nut-allergy","labelEs":"Alergia a Nueces"}],"required":false},
      {"name":"adaAccommodations","type":"select","label":"ADA Accommodations?","labelEs":"Necesita Acomodaciones ADA?","options":[{"label":"No","value":"no"},{"label":"Yes","value":"yes","labelEs":"Sí"}],"required":true},
      {"name":"roomType","type":"select","label":"Room Type","labelEs":"Tipo de Habitación","options":[{"label":"One King Bed","value":"one-king","labelEs":"Una Cama King"},{"label":"Two Queen Beds","value":"two-queens","labelEs":"Dos Camas Queen"}],"required":true},
      {"name":"termsAccepted","type":"checkbox","label":"By checking this box, I acknowledge and accept all terms outlined in the event waiver.","labelEs":"Al marcar esta casilla, reconozco y acepto todos los términos descritos en la exención del evento.","required":true,"waiverUrl":"https://drive.google.com/file/d/1yYXgsMzkE0kjVd-7-Bo5LWLH7wNpEyp1/view"}
    ]);
    
    await client.query(`
      INSERT INTO form_templates (key, name, name_es, description, description_es, fields, is_default)
      VALUES ('success_trip', 'Success Trip', 'Viaje de Éxito', 'Registration form for success trips with passport, clothing sizes, and dietary requirements', 'Formulario de registro para viajes de éxito con pasaporte, tallas de ropa y requisitos dietéticos', $1::jsonb, true)
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        name_es = EXCLUDED.name_es,
        description = EXCLUDED.description,
        description_es = EXCLUDED.description_es,
        fields = EXCLUDED.fields,
        is_default = EXCLUDED.is_default,
        last_modified = now()
    `, [successTripFieldsUpsert]);
    
    // Method template
    const methodFieldsUpsert = JSON.stringify([
      {"name":"unicityId","type":"text","label":"Distributor ID","locked":true,"labelEs":"ID de Distribuidor","required":true},
      {"name":"email","type":"email","label":"Email Address","labelEs":"Correo Electrónico","editable":true,"required":true},
      {"name":"firstName","type":"text","label":"First Name","labelEs":"Nombre","editable":true,"required":true},
      {"name":"lastName","type":"text","label":"Last Name","labelEs":"Apellido","editable":true,"required":true},
      {"name":"preferredLanguage","type":"select","label":"What language would you prefer?","labelEs":"¿Qué idioma prefiere?","options":[{"label":"English","value":"english","labelEs":"Inglés"},{"label":"Spanish","value":"spanish","labelEs":"Español"},{"label":"French","value":"french","labelEs":"Francés"}],"required":true},
      {"name":"firstMethodAttending","type":"select","label":"Is this the first Method you are attending?","labelEs":"¿Es este el primer Method al que asiste?","options":[{"label":"Yes","value":"yes","labelEs":"Sí"},{"label":"No","value":"no"}],"required":true},
      {"name":"vegetarianVeganOptions","type":"text","label":"Vegetarian or Vegan Options","labelEs":"Opciones Vegetarianas o Veganas","required":false},
      {"name":"headphonesAccommodationAcknowledgment","type":"checkbox","label":"I know that I am responsible for bringing my own headphones and I am also responsible for arranging my own accommodation for the trip.","labelEs":"Sé que soy responsable de traer mis propios auriculares y también soy responsable de organizar mi propio alojamiento para el viaje.","required":true},
      {"name":"cancellationFeeAgreement","type":"checkbox","label":"By checking this box, I agree that $200 will be deductible from my commission if I register and don't attend the seminar or cancel by the deadline.","labelEs":"Al marcar esta casilla, acepto que se deducirán $200 de mi comisión si me registro y no asisto al seminario o cancelo antes de la fecha límite.","required":true},
      {"name":"releaseForms","type":"checkbox","label":"By checking this box, I agree to our Breathing Exercises Release Form and Accept our Agreement To Not Share.","labelEs":"Al marcar esta casilla, acepto nuestro Formulario de Liberación de Ejercicios de Respiración y Acepto nuestro Acuerdo de No Compartir.","required":true,"waiverUrl":"https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:c859aee0-0bf6-4650-9b68-a151cb235992","secondaryWaiverUrl":"https://docs.google.com/document/d/10oJqzlVD3t_2atZKSEdnmYfwmLwpufCg/edit"}
    ]);
    
    await client.query(`
      INSERT INTO form_templates (key, name, name_es, description, description_es, fields, is_default)
      VALUES ('method', 'Method', 'Método', 'Registration form for Method seminars with language preference and acknowledgments', 'Formulario de registro para seminarios Method con preferencia de idioma y reconocimientos', $1::jsonb, false)
      ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        name_es = EXCLUDED.name_es,
        description = EXCLUDED.description,
        description_es = EXCLUDED.description_es,
        fields = EXCLUDED.fields,
        is_default = EXCLUDED.is_default,
        last_modified = now()
    `, [methodFieldsUpsert]);
    
    console.log('Predefined form templates upserted.');
    
    // Add form_template_id column to events if it doesn't exist
    const formTemplateIdCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' 
      AND column_name = 'form_template_id'
    `);
    
    if (formTemplateIdCheck.rows.length === 0) {
      console.log('Adding form_template_id column to events...');
      await client.query(`
        ALTER TABLE events 
        ADD COLUMN form_template_id varchar REFERENCES form_templates(id)
      `);
      console.log('form_template_id column added to events.');
    } else {
      console.log('form_template_id column already exists in events.');
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
