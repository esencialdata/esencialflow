
import * as admin from 'firebase-admin';
import * as serviceAccount from './serviceAccountKey.json';

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as any)
});

const db = admin.firestore();
const docId = 'wHnviEY6gwIFvnMEPlNR';
const collections = ['cards', 'lists', 'boards', 'users', 'tasks'];

async function search() {
    console.log(`Searching for document ID: ${docId}`);

    for (const colName of collections) {
        try {
            const docRef = db.collection(colName).doc(docId);
            const doc = await docRef.get();

            if (doc.exists) {
                console.log(`FOUND in collection: ${colName}`);
                console.log(JSON.stringify(doc.data(), null, 2));
                return;
            } else {
                console.log(`Not found in ${colName}`);
            }
        } catch (error) {
            console.error(`Error searching ${colName}:`, error);
        }
    }

    console.log('Document not found in standard collections.');
}

search().catch(console.error);
