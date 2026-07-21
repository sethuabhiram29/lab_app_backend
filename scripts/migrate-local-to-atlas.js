require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://localhost:27017/MongoDB';
const ATLAS_URI = process.env.MONGODB_URI;

async function migrate() {
    try {
        console.log('Connecting to Local DB...');
        const localDb = await mongoose.createConnection(LOCAL_URI).asPromise();
        console.log('Local DB connected!');
        
        console.log('Connecting to Atlas DB...');
        const atlasDb = await mongoose.createConnection(ATLAS_URI).asPromise();
        console.log('Atlas DB connected!');

        // The collections representing the master data we want to transfer
        const collectionsToMigrate = ['tests', 'subtests', 'equipment', 'doctors', 'agents'];

        for (const collectionName of collectionsToMigrate) {
            console.log(`\nMigrating collection: ${collectionName}...`);
            
            try {
                // Get all documents from the local database
                const docs = await localDb.collection(collectionName).find({}).toArray();
                
                if (docs.length === 0) {
                    console.log(`  -> No documents found in ${collectionName}. Skipping.`);
                    continue;
                }

                console.log(`  -> Found ${docs.length} documents. Transferring to Atlas...`);
                
                // Clear the target collection first to avoid duplicate key errors on _id, 
                // since we are replacing the cloud data with the local data.
                await atlasDb.collection(collectionName).deleteMany({});
                
                // Insert into Atlas
                await atlasDb.collection(collectionName).insertMany(docs);
                console.log(`  -> Successfully transferred ${docs.length} documents!`);
            } catch (error) {
                console.error(`  -> Error migrating ${collectionName}:`, error.message);
            }
        }

        console.log('\n✅ Data Migration complete!');
        await localDb.close();
        await atlasDb.close();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
