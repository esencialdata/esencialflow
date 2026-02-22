
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const boardId = 'wHnviEY6gwIFvnMEPlNR';

async function getBoardContent() {
    console.log(`Fetching content for board ID: ${boardId}`);

    // Get Board
    const boardDoc = await db.collection('boards').doc(boardId).get();
    if (!boardDoc.exists) {
        console.log('Board not found!');
        return;
    }
    const board = { id: boardDoc.id, ...boardDoc.data() };

    // Get Lists
    const listsSnapshot = await db.collection('lists').where('boardId', '==', boardId).get();
    const lists = [];
    listsSnapshot.forEach(doc => lists.push({ id: doc.id, ...doc.data() }));

    // Get Cards for these lists
    const cards = [];
    for (const list of lists) {
        const cardsSnapshot = await db.collection('cards').where('listId', '==', list.id).get();
        cardsSnapshot.forEach(doc => {
            const cardData = doc.data();
            // Calculate a simple 'pending' status based on list name or status field if exists
            // But we just want to show the JSON.
            cards.push({ id: doc.id, ...cardData, _listName: list.name });
        });
    }

    // Construct hierarchy
    const result = {
        board: board,
        lists: lists.map(l => ({
            ...l,
            cards: cards.filter(c => c.listId === l.id).sort((a, b) => (a.position || 0) - (b.position || 0))
        }))
    };

    console.log(JSON.stringify(result, null, 2));
}

getBoardContent().catch(console.error);
