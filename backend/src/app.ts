import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as admin from 'firebase-admin';

type ServiceAccountShape = {
  project_id?: string;
  storageBucket?: string;
};

const resolveStorageBucket = (serviceAccount?: ServiceAccountShape): string | undefined => {
  const explicit = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (explicit) {
    return explicit;
  }
  if (serviceAccount?.storageBucket?.trim()) {
    return serviceAccount.storageBucket.trim();
  }
  const projectId = serviceAccount?.project_id ?? process.env.FIREBASE_PROJECT_ID;
  if (projectId?.trim()) {
    return `${projectId.trim()}.appspot.com`;
  }
  return 'esencial-flow-uploads-1234';
};

const parseServiceAccount = (raw: string): (ServiceAccountShape & admin.ServiceAccount) | null => {
  const attempts: string[] = [];
  attempts.push(raw);
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    attempts.unshift(decoded);
  } catch {}

  for (const candidate of attempts) {
    if (!candidate || typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      return JSON.parse(trimmed) as ServiceAccountShape & admin.ServiceAccount;
    } catch {}
  }
  return null;
};

const initializeFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    return;
  }

  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountString) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: FIREBASE_SERVICE_ACCOUNT env var not set. Firebase Admin SDK could not be initialized.');
      return;
    }

    try {
      const serviceAccount = require('./serviceAccountKey.json') as ServiceAccountShape;
      const storageBucket = resolveStorageBucket(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        ...(storageBucket ? { storageBucket } : {}),
      });
      console.log('Firebase Admin SDK initialized using local serviceAccountKey.json');
      if (!storageBucket) {
        console.warn('No storage bucket configured. Attachment endpoints will be unavailable.');
      }
      return;
    } catch (error) {
      console.error('Could not initialize Firebase Admin SDK. Missing serviceAccountKey.json and FIREBASE_SERVICE_ACCOUNT env var.', error);
      return;
    }
  }

  try {
    const parsed = parseServiceAccount(serviceAccountString);
    if (!parsed) {
      console.error('FATAL: FIREBASE_SERVICE_ACCOUNT env var could not be parsed.');
      return;
    }
    const storageBucket = resolveStorageBucket(parsed);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
      ...(storageBucket ? { storageBucket } : {}),
    });
    console.log('Firebase Admin SDK initialized successfully from environment variable.');
    if (!storageBucket) {
      console.warn('No storage bucket configured. Attachment endpoints will be unavailable.');
    }
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK from environment variable:', error);
  }
};

initializeFirebaseAdmin();

const appInstance = admin.apps[0];
const configuredBucket = appInstance?.options?.storageBucket;
const bucket = configuredBucket ? admin.storage().bucket(configuredBucket) : null;

if (!configuredBucket) {
  console.warn('Firebase storage bucket not configured. Attachment endpoints will be unavailable.');
}

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

const PRIORITY_VALUES = ['low', 'medium', 'high'] as const;
type PriorityValue = typeof PRIORITY_VALUES[number];

const sanitizePriority = (value: any, fallback: PriorityValue = 'medium'): PriorityValue => {
  if (typeof value === 'string' && PRIORITY_VALUES.includes(value as PriorityValue)) {
    return value as PriorityValue;
  }
  return fallback;
};

// Helpers
const toTimestamp = (value: any): admin.firestore.Timestamp | undefined => {
  if (!value) return undefined;
  // Already a Firestore Timestamp
  // @ts-ignore
  if (value instanceof admin.firestore.Timestamp) return value as admin.firestore.Timestamp;
  // From typical shapes
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new admin.firestore.Timestamp(value._seconds, value._nanoseconds || 0);
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new admin.firestore.Timestamp(value.seconds, value.nanoseconds || 0);
  }
  // From string / number / Date
  if (typeof value === 'string') {
    // Handle 'YYYY-MM-DD' as a local date (midnight)
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      return admin.firestore.Timestamp.fromDate(new Date(y, mo, da, 0, 0, 0, 0));
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return admin.firestore.Timestamp.fromDate(d);
};

const buildDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const sanitizeDateParam = (value?: string | null): string | null => {
  if (!value) {
    return buildDateKey(new Date());
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return buildDateKey(parsed);
};

const fromFirestoreTimestamp = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate();
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
};

// Users API
app.get('/api/users', async (req, res) => {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    const users = snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Habits API
app.get('/api/habits', async (req, res) => {
  try {
    const { userId, includeArchived } = req.query as { userId?: string; includeArchived?: string };
    let habitsQuery: admin.firestore.Query = db.collection('habits');
    if (userId) {
      habitsQuery = habitsQuery.where('userId', '==', userId);
    }
    const snapshot = await habitsQuery.get();
    const include = includeArchived === 'true';
    const habits = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((habit: any) => include || !habit.archived);
    res.json(habits);
  } catch (error) {
    console.error('Error fetching habits:', error);
    res.status(500).json({ message: 'Error fetching habits' });
  }
});

app.post('/api/habits', async (req, res) => {
  try {
    const { name, description, userId } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ message: 'name and userId are required' });
    }

    const habitPayload = {
      name: trimmedName,
      description: typeof description === 'string' ? description.trim() : '',
      userId,
      archived: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('habits').add(habitPayload);
    const saved = await docRef.get();
    res.status(201).json({ id: docRef.id, ...saved.data() });
  } catch (error) {
    console.error('Error creating habit:', error);
    res.status(500).json({ message: 'Error creating habit' });
  }
});

app.put('/api/habits/:habitId', async (req, res) => {
  try {
    const { habitId } = req.params;
    const { name, description, archived } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ message: 'name is required' });
    }

    const habitRef = db.collection('habits').doc(habitId);
    const snap = await habitRef.get();
    if (!snap.exists) {
      return res.status(204).send();
    }

    const updatePayload: Record<string, any> = {
      name: trimmedName,
      description: typeof description === 'string' ? description.trim() : '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (typeof archived === 'boolean') {
      updatePayload.archived = archived;
    }

    await habitRef.update(updatePayload);
    const updated = await habitRef.get();
    res.json({ id: habitId, ...updated.data() });
  } catch (error) {
    console.error('Error updating habit:', error);
    res.status(500).json({ message: 'Error updating habit' });
  }
});

app.delete('/api/habits/:habitId', async (req, res) => {
  try {
    const { habitId } = req.params;
    const habitRef = db.collection('habits').doc(habitId);
    const snap = await habitRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: 'Habit not found' });
    }

    const completionsSnap = await db
      .collection('habitCompletions')
      .where('habitId', '==', habitId)
      .get();

    const batch = db.batch();
    completionsSnap.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(habitRef);
    await batch.commit();

    res.json({ id: habitId, deletedCompletions: completionsSnap.size });
  } catch (error) {
    console.error('Error deleting habit:', error);
    res.status(500).json({ message: 'Error deleting habit' });
  }
});

app.get('/api/habits/daily', async (req, res) => {
  try {
    const { userId, date } = req.query as { userId?: string; date?: string };
    const dateKey = sanitizeDateParam(date || null);
    if (!dateKey) {
      return res.status(400).json({ message: 'Invalid date parameter' });
    }

    let habitsQuery: admin.firestore.Query = db.collection('habits');
    if (userId) {
      habitsQuery = habitsQuery.where('userId', '==', userId);
    }
    const habitsSnapshot = await habitsQuery.get();
    const activeHabits = habitsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((habit: any) => !habit.archived);

    if (!activeHabits.length) {
      return res.json([]);
    }

    let completionQuery = db.collection('habitCompletions').where('date', '==', dateKey);
    if (userId) {
      completionQuery = completionQuery.where('userId', '==', userId);
    }
    const completionsSnapshot = await completionQuery.get();
    const completions = new Map<string, any>();
    completionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data && data.habitId) {
        completions.set(data.habitId, { id: doc.id, ...data });
      }
    });

    const payload = activeHabits.map((habit: any) => {
      const completion = completions.get(habit.id);
      const completedAt = completion ? fromFirestoreTimestamp(completion.completedAt) : null;
      return {
        ...habit,
        date: dateKey,
        completed: Boolean(completion),
        completedAt: completedAt ? completedAt.toISOString() : null,
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Error fetching daily habits:', error);
    res.status(500).json({ message: 'Error fetching daily habits' });
  }
});

app.post('/api/habits/:habitId/check', async (req, res) => {
  try {
    const { habitId } = req.params;
    const { date, userId } = req.body || {};
    const dateKey = sanitizeDateParam(date || null);
    if (!dateKey) {
      return res.status(400).json({ message: 'Invalid date parameter' });
    }

    const habitRef = db.collection('habits').doc(habitId);
    const habitSnap = await habitRef.get();
    if (!habitSnap.exists) {
      return res.status(404).json({ message: 'Habit not found' });
    }
    const habitData = habitSnap.data() as any;
    if (userId && habitData.userId && userId !== habitData.userId) {
      return res.status(403).json({ message: 'Habit does not belong to user' });
    }

    const completionId = `${habitId}_${dateKey}`;
    const completionRef = db.collection('habitCompletions').doc(completionId);
    const completionPayload = {
      habitId,
      userId: habitData.userId,
      date: dateKey,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await completionRef.set(completionPayload, { merge: true });
    const saved = await completionRef.get();
    res.status(201).json({ id: completionRef.id, ...saved.data() });
  } catch (error) {
    console.error('Error checking habit:', error);
    res.status(500).json({ message: 'Error checking habit' });
  }
});

app.delete('/api/habits/:habitId/check', async (req, res) => {
  try {
    const { habitId } = req.params;
    const { date, userId } = req.query as { date?: string; userId?: string };
    const dateKey = sanitizeDateParam(date || null);
    if (!dateKey) {
      return res.status(400).json({ message: 'Invalid date parameter' });
    }

    const habitRef = db.collection('habits').doc(habitId);
    const habitSnap = await habitRef.get();
    if (!habitSnap.exists) {
      return res.status(404).json({ message: 'Habit not found' });
    }
    const habitData = habitSnap.data() as any;
    if (userId && habitData.userId && userId !== habitData.userId) {
      return res.status(403).json({ message: 'Habit does not belong to user' });
    }

    const completionId = `${habitId}_${dateKey}`;
    const completionRef = db.collection('habitCompletions').doc(completionId);
    const completionSnap = await completionRef.get();
    if (!completionSnap.exists) {
      return res.status(204).send();
    }

    await completionRef.delete();
    res.json({ id: completionId, habitId, date: dateKey });
  } catch (error) {
    console.error('Error unchecking habit:', error);
    res.status(500).json({ message: 'Error unchecking habit' });
  }
});

// Boards API
app.get('/api/boards', async (req, res) => {
  try {
    const boardsRef = db.collection('boards');
    const snapshot = await boardsRef.get();
    const boards = snapshot.docs.map(doc => ({ boardId: doc.id, ...doc.data() }));
    res.json(boards);
  } catch (error) {
    console.error("Error fetching boards:", error);
    res.status(500).json({ message: "Error fetching boards" });
  }
});

app.get('/api/boards/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;
    const boardRef = db.collection('boards').doc(boardId);
    const doc = await boardRef.get();
    if (!doc.exists) {
      res.status(404).json({ message: "Board not found" });
    } else {
      res.json({ boardId: doc.id, ...doc.data() });
    }
  } catch (error) {
    console.error("Error fetching board:", error);
    res.status(500).json({ message: "Error fetching board" });
  }
});

app.post('/api/boards', async (req, res) => {
  try {
    const newBoardData = {
      ...req.body,
      priority: sanitizePriority((req.body as any)?.priority, 'medium'),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('boards').add(newBoardData);
    const newBoard = { boardId: docRef.id, ...newBoardData };
    res.status(201).json(newBoard);
  } catch (error) {
    console.error("Error creating board:", error);
    res.status(500).json({ message: "Error creating board" });
  }
});

app.put('/api/boards/:boardId', async (req, res) => {
  try {
    const { boardId } = req.params;
    const updatedBoardData = {
      ...req.body,
      ...(Object.prototype.hasOwnProperty.call(req.body, 'priority')
        ? { priority: sanitizePriority(req.body.priority) }
        : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('boards').doc(boardId).update(updatedBoardData);
    res.json({ boardId: boardId, ...updatedBoardData });
  } catch (error) {
    console.error("Error updating board:", error);
    res.status(500).json({ message: "Error updating board" });
  }
});

app.delete('/api/boards/:boardId', async (req, res) => {
  const { boardId } = req.params;
  const batch = db.batch();

  try {
    console.log(`Atomically deleting board ${boardId} and all its contents...`);

    // 1. Find all lists associated with the board
    const listsSnapshot = await db.collection('lists').where('boardId', '==', boardId).get();

    // 2. For each list, find its cards and add both cards and list to the batch for deletion
    if (!listsSnapshot.empty) {
      console.log(`Found ${listsSnapshot.size} lists to delete.`);
      for (const listDoc of listsSnapshot.docs) {
        const listId = listDoc.id;
        const cardsSnapshot = await db.collection('cards').where('listId', '==', listId).get();
        cardsSnapshot.docs.forEach(cardDoc => {
          console.log(`  - Queuing card ${cardDoc.id} for deletion.`);
          batch.delete(cardDoc.ref);
        });
        console.log(`  - Queuing list ${listId} for deletion.`);
        batch.delete(listDoc.ref);
      }
    }

    // 3. Add the board itself to the batch
    const boardRef = db.collection('boards').doc(boardId);
    batch.delete(boardRef);

    // 4. Commit the atomic batch
    await batch.commit();
    console.log(`Board ${boardId} and all its contents were deleted successfully.`);
    res.status(200).json({ message: "Board and its contents deleted successfully" });

  } catch (error) {
    console.error(`Failed to delete board ${boardId}:`, error);
    if (error instanceof Error) {
      res.status(500).json({ message: `Failed to delete board: ${error.message}` });
    } else {
      res.status(500).json({ message: 'An unknown error occurred' });
    }
  }
});

// GET all cards for a specific board (efficiently)
app.get('/api/boards/:boardId/cards', async (req, res) => {
  try {
    const { boardId } = req.params;
    
    // Find all lists for the given boardId
    const listsSnapshot = await db.collection('lists').where('boardId', '==', boardId).get();
    
    if (listsSnapshot.empty) {
      return res.json([]);
    }

    const listIds = listsSnapshot.docs.map(doc => doc.id);

    // Find all cards that belong to any of those lists
    const cardsSnapshot = await db.collection('cards').where('listId', 'in', listIds).get();
    const boardCards = cardsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json(boardCards);
  } catch (error) {
    console.error("Error fetching cards for board:", error);
    res.status(500).json({ message: "Error fetching cards for board" });
  }
});

// Lists API
app.get('/api/boards/:boardId/lists', async (req, res) => {
  try {
    const { boardId } = req.params;
    const listsRef = db.collection('lists').where('boardId', '==', boardId);
    const snapshot = await listsRef.orderBy('position').get();
    const lists = snapshot.docs.map(doc => ({ listId: doc.id, ...doc.data() }));
    res.json(lists);
  } catch (error) {
    console.error("Error fetching lists:", error);
    res.status(500).json({ message: "Error fetching lists" });
  }
});

app.post('/api/boards/:boardId/lists', async (req, res) => {
  try {
    const { boardId } = req.params;
    const newListData = {
      ...req.body,
      boardId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('lists').add(newListData);
    const newList = { id: docRef.id, ...newListData };
    res.status(201).json(newList);
  } catch (error) {
    console.error("Error creating list:", error);
    res.status(500).json({ message: "Error creating list" });
  }
});

app.put('/api/lists/:listId', async (req, res) => {
  try {
    const { listId } = req.params;
    const updatedListData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('lists').doc(listId).update(updatedListData);
    res.json({ id: listId, ...updatedListData });
  } catch (error) {
    console.error("Error updating list:", error);
    res.status(500).json({ message: "Error updating list" });
  }
});

app.delete('/api/lists/:listId', async (req, res) => {
  try {
    const { listId } = req.params;
    const batch = db.batch();

    // Delete associated cards
    const cardsSnapshot = await db.collection('cards').where('listId', '==', listId).get();
    for (const cardDoc of cardsSnapshot.docs) {
      batch.delete(cardDoc.ref);
    }

    // Delete the list itself
    batch.delete(db.collection('lists').doc(listId));

    await batch.commit();
    res.json({ message: "List and associated cards deleted successfully" });
  } catch (error) {
    console.error("Error deleting list:", error);
    res.status(500).json({ message: "Error deleting list" });
  }
});

// Cards API
app.get('/api/cards', async (req, res) => {
  try {
    const cardsRef = db.collection('cards');
    const snapshot = await cardsRef.get();
    const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(cards);
  } catch (error) {
    console.error("Error fetching cards:", error);
    res.status(500).json({ message: "Error fetching cards" });
  }
});

app.get('/api/cards/today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const cardsRef = db.collection('cards');
    const snapshot = await cardsRef
      .where('dueDate', '>=', today)
      .where('dueDate', '<', tomorrow)
      .get();

    const todayCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(todayCards);
  } catch (error) {
    console.error("Error fetching today's cards:", error);
    res.status(500).json({ message: "Error fetching today's cards" });
  }
});

// Flexible search by due date range, optionally filter by userId
app.get('/api/cards/search', async (req, res) => {
  try {
    const { start, end, userId } = req.query as { start?: string; end?: string; userId?: string };
    if (!start || !end) {
      return res.status(400).json({ message: 'start and end query params are required (ISO strings)' });
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ message: 'invalid start or end date' });
    }

    const snapshot = await db
      .collection('cards')
      .where('dueDate', '>=', startDate)
      .where('dueDate', '<', endDate)
      .get();

    let cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (userId) {
      cards = cards.filter((c: any) => c.assignedToUserId === userId);
    }
    res.json(cards);
  } catch (error) {
    console.error('Error searching cards by due date:', error);
    res.status(500).json({ message: 'Error searching cards' });
  }
});

app.get('/api/lists/:listId/cards', async (req, res) => {
  try {
    const { listId } = req.params;
    const cardsRef = db.collection('cards').where('listId', '==', listId);
    const snapshot = await cardsRef.get();
    const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(cards);
  } catch (error) {
    console.error("Error fetching cards for list:", error);
    res.status(500).json({ message: "Error fetching cards for list" });
  }
});

app.post('/api/lists/:listId/cards', async (req, res) => {
  try {
    const { listId } = req.params;
    const incoming = { ...req.body } as any;
    if (incoming.dueDate) {
      const ts = toTimestamp(incoming.dueDate);
      if (ts) incoming.dueDate = ts;
    }
    const priority = sanitizePriority(incoming.priority, 'medium');
    delete incoming.priority;

    // Determine position at end of list if not provided
    let position = incoming.position;
    if (position === undefined) {
      const countSnap = await db.collection('cards').where('listId', '==', listId).get();
      position = countSnap.size; // append to end
    }

    const newCardData = {
      ...incoming,
      position,
      listId,
      priority,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('cards').add(newCardData);
    const newCard = { id: docRef.id, ...newCardData };
    res.status(201).json(newCard);

    // Trigger webhooks for card_created event
    const webhooksSnapshot = await db.collection('webhooks').where('triggerEvent', '==', 'card_created').get();
    webhooksSnapshot.docs.forEach(async (doc) => {
      const webhook = doc.data();
      try {
        await axios.post(webhook.url, { event: 'card_created', card: newCard });
        console.log(`Webhook for card_created sent to ${webhook.url}`);
      } catch (webhookError) {
        console.error(`Error sending webhook to ${webhook.url}:`, webhookError);
      }
    });

  } catch (error) {
    console.error("Error creating card:", error);
    res.status(500).json({ message: "Error creating card" });
  }
});

app.put('/api/cards/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    const incoming = { ...req.body } as any;
    if (incoming.dueDate) {
      const ts = toTimestamp(incoming.dueDate);
      if (ts) incoming.dueDate = ts;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'priority')) {
      incoming.priority = sanitizePriority(incoming.priority);
    }

    const updatedCardData = {
      ...incoming,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('cards').doc(cardId).update(updatedCardData);
    res.json({ id: cardId, ...updatedCardData });
  } catch (error) {
    console.error("Error updating card:", error);
    res.status(500).json({ message: "Error updating card" });
  }
});

app.patch('/api/cards/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    const incoming = { ...req.body } as any;

    // Handle incrementing actualTime
    if (incoming.incrementActualTime) {
      const increment = Number(incoming.incrementActualTime);
      delete incoming.incrementActualTime;
      if (!isNaN(increment) && increment > 0) {
        incoming.actualTime = admin.firestore.FieldValue.increment(increment);
      }
    }

    if (incoming.dueDate) {
      const ts = toTimestamp(incoming.dueDate);
      if (ts) incoming.dueDate = ts;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'priority')) {
      incoming.priority = sanitizePriority(incoming.priority);
    }

    const updatedFields = {
      ...incoming,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const oldCardDoc = await db.collection('cards').doc(cardId).get();
    const oldCardData = oldCardDoc.data();

    // Trigger webhooks for card_moved event if listId changed
    if (oldCardData && oldCardData.listId !== updatedFields.listId) {
      const webhooksSnapshot = await db.collection('webhooks').where('triggerEvent', '==', 'card_moved').get();
      webhooksSnapshot.docs.forEach(async (doc) => {
        const webhook = doc.data();
        try {
          await axios.post(webhook.url, { event: 'card_moved', cardId, oldListId: oldCardData.listId, newListId: updatedFields.listId, card: { id: cardId, ...updatedFields } });
          console.log(`Webhook for card_moved sent to ${webhook.url}`);
        } catch (webhookError) {
          console.error(`Error sending webhook to ${webhook.url}:`, webhookError);
        }
      });
    }

    await db.collection('cards').doc(cardId).update(updatedFields);
    res.json({ id: cardId, ...updatedFields });
  } catch (error) {
    console.error("Error patching card:", error);
    res.status(500).json({ message: "Error patching card" });
  }
});

app.delete('/api/cards/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    await db.collection('cards').doc(cardId).delete();
    res.json({ message: "Card deleted successfully" });
  } catch (error) {
    console.error("Error deleting card:", error);
    res.status(500).json({ message: "Error deleting card" });
  }
});

// Attachments API
app.post('/api/cards/:cardId/request-upload-url', async (req, res) => {
  const { cardId } = req.params;
  const { fileName, fileType } = req.body;

  if (!fileName || !fileType) {
    return res.status(400).json({ message: 'fileName and fileType are required' });
  }

  if (!bucket) {
    return res.status(503).json({ message: 'Storage bucket not configured.' });
  }

  const filePath = `attachments/${cardId}/${Date.now()}-${fileName}`;
  const file = bucket.file(filePath);

  // No fijamos contentType en la firma para evitar errores de coincidencia de cabeceras
  const options = {
    version: 'v4' as const,
    action: 'write' as const,
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
  };

  try {
    const [signedUrl] = await file.getSignedUrl(options);
    res.status(200).json({ signedUrl, filePath });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ message: 'Could not generate upload URL.' });
  }
});

app.post('/api/cards/:cardId/attachments', async (req, res) => {
  const { cardId } = req.params;
  const attachmentData = req.body;

  try {
    const cardRef = db.collection('cards').doc(cardId);
    // Firestore no permite serverTimestamp dentro de arrayUnion: usar Timestamp.now()
    if (!attachmentData || !attachmentData.attachmentId || !attachmentData.fileName || !attachmentData.url) {
      return res.status(400).json({ message: 'Invalid attachment payload' });
    }

    const newAttachment = {
      ...attachmentData,
      createdAt: admin.firestore.Timestamp.now(),
    };

    await cardRef.set(
      { attachments: admin.firestore.FieldValue.arrayUnion(newAttachment) },
      { merge: true }
    );

    res.status(201).json(newAttachment);
  } catch (error) {
    console.error('Error adding attachment to card:', error);
    res.status(500).json({ message: 'Could not add attachment.' });
  }
});

// Generate a temporary READ URL for an attachment (so you can open without making it public)
app.get('/api/cards/:cardId/attachments/signed-read', async (req, res) => {
  try {
    const filePath = String(req.query.filePath || '');
    if (!filePath) {
      return res.status(400).json({ message: 'filePath is required' });
    }
    if (!bucket) {
      return res.status(503).json({ message: 'Storage bucket not configured.' });
    }
    const file = bucket.file(filePath);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    });
    res.json({ url });
  } catch (error) {
    console.error('Error generating signed READ URL:', error);
    res.status(500).json({ message: 'Could not generate signed READ URL.' });
  }
});

// Remove an attachment from a card (and optionally delete the object in GCS)
app.delete('/api/cards/:cardId/attachments/:attachmentId', async (req, res) => {
  const { cardId, attachmentId } = req.params;
  const { deleteObject } = req.query as { deleteObject?: string };
  try {
    const cardRef = db.collection('cards').doc(cardId);
    const snap = await cardRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: 'Card not found' });
    }
    const data = snap.data() as any;
    const attachments: any[] = Array.isArray(data?.attachments) ? data.attachments : [];
    const toRemove = attachments.find(a => a.attachmentId === attachmentId);
    if (!toRemove) {
      return res.status(404).json({ message: 'Attachment not found' });
    }
    const remaining = attachments.filter(a => a.attachmentId !== attachmentId);
    await cardRef.update({ attachments: remaining });

    if (deleteObject === 'true' || deleteObject === '1') {
      if (!bucket) {
        console.warn('Storage bucket not configured; skipping object deletion.');
      } else {
        try {
          await bucket.file(attachmentId).delete({ ignoreNotFound: true } as any);
        } catch (e) {
          console.error('Failed deleting object from bucket:', e);
          // do not fail the request if object deletion fails
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ message: 'Could not delete attachment.' });
  }
});

// Batch reorder cards (position and optional listId) for performance
app.post('/api/cards/reorder-batch', async (req, res) => {
  try {
    const updates = req.body && Array.isArray(req.body.updates) ? req.body.updates : null;
    if (!updates || updates.length === 0) {
      return res.status(400).json({ message: 'updates array is required' });
    }

    const batch = db.batch();
    for (const u of updates) {
      if (!u.cardId || typeof u.position !== 'number') continue;
      const ref = db.collection('cards').doc(String(u.cardId));
      const payload: any = {
        position: u.position,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (u.listId) payload.listId = String(u.listId);
      batch.update(ref, payload);
    }
    await batch.commit();
    res.json({ ok: true, count: updates.length });
  } catch (error) {
    console.error('Error in reorder-batch:', error);
    res.status(500).json({ message: 'Error reordering cards' });
  }
});

// Timer Sessions API
app.post('/api/timer-sessions', async (req, res) => {
  try {
    const newSessionData = {
      ...req.body,
      startTime: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('timerSessions').add(newSessionData);
    const newSession = { id: docRef.id, ...newSessionData };
    res.status(201).json(newSession);
  } catch (error) {
    console.error("Error creating timer session:", error);
    res.status(500).json({ message: "Error creating timer session" });
  }
});

app.patch('/api/timer-sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updatedSessionData = {
      ...req.body,
      endTime: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('timerSessions').doc(sessionId).update(updatedSessionData);
    res.json({ id: sessionId, ...updatedSessionData });
  } catch (error) {
    console.error("Error updating timer session:", error);
    res.status(500).json({ message: "Error updating timer session" });
  }
});

// Webhooks API
app.post('/api/webhooks', async (req, res) => {
  try {
    const newWebhookData = {
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('webhooks').add(newWebhookData);
    const newWebhook = { id: docRef.id, ...newWebhookData };
    res.status(201).json(newWebhook);
  } catch (error) {
    console.error("Error creating webhook:", error);
    res.status(500).json({ message: "Error creating webhook" });
  }
});

// Comments API
app.get('/api/cards/:cardId/comments', async (req, res) => {
  try {
    const { cardId } = req.params;
    const snapshot = await db
      .collection('comments')
      .where('cardId', '==', cardId)
      .get();
    const comments = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => {
        const aa = a.createdAt?._seconds ? a.createdAt._seconds : 0;
        const bb = b.createdAt?._seconds ? b.createdAt._seconds : 0;
        return aa - bb;
      });
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Error fetching comments' });
  }
});

app.post('/api/cards/:cardId/comments', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { authorUserId, text, mentions } = req.body || {};
    if (!authorUserId || !text) {
      return res.status(400).json({ message: 'authorUserId and text are required' });
    }

    const newComment = {
      cardId,
      authorUserId,
      text,
      mentions: Array.isArray(mentions) ? mentions : [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('comments').add(newComment);
    // fetch saved doc to return resolved timestamps instead of FieldValue sentinel
    const saved = await ref.get();
    // Notificaciones por menciones (simple: persistimos en colección notifications)
    try {
      const m: string[] = Array.isArray(mentions) ? mentions : [];
      if (m.length) {
        const batch = db.batch();
        m.forEach((uid: string) => {
          const nref = db.collection('notifications').doc();
          batch.set(nref, {
            type: 'mention',
            targetUserId: uid,
            cardId,
            commentId: ref.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('Failed creating mention notifications:', e);
    }
    res.status(201).json({ id: ref.id, ...saved.data() });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ message: 'Error creating comment' });
  }
});

app.put('/api/cards/:cardId/comments/:commentId', async (req, res) => {
  try {
    const { cardId, commentId } = req.params;
    const { text, mentions } = req.body || {};
    if (!text) {
      return res.status(400).json({ message: 'text is required' });
    }
    const ref = db.collection('comments').doc(commentId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    const data = snap.data() as any;
    if (data.cardId !== cardId) {
      return res.status(400).json({ message: 'Comment does not belong to this card' });
    }
    const updated = { text, mentions: Array.isArray(mentions) ? mentions : data.mentions || [], updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    await ref.update(updated);
    // Notificaciones por nuevas menciones (no intentamos diferenciar, notificamos a todos los incluidos)
    try {
      const m: string[] = Array.isArray(mentions) ? mentions : [];
      if (m.length) {
        const batch = db.batch();
        m.forEach((uid: string) => {
          const nref = db.collection('notifications').doc();
          batch.set(nref, {
            type: 'mention',
            targetUserId: uid,
            cardId,
            commentId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('Failed creating mention notifications on edit:', e);
    }
    res.json({ id: commentId, ...data, ...updated });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ message: 'Error updating comment' });
  }
});

app.delete('/api/cards/:cardId/comments/:commentId', async (req, res) => {
  try {
    const { cardId, commentId } = req.params;
    const ref = db.collection('comments').doc(commentId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    const data = snap.data() as any;
    if (data.cardId !== cardId) {
      console.warn(`Comment ${commentId} belongs to ${data.cardId} not ${cardId}. Deleting anyway.`);
    }
    await ref.delete();
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ message: 'Error deleting comment' });
  }
});

app.get('/api/webhooks', async (req, res) => {
  try {
    const webhooksRef = db.collection('webhooks');
    const snapshot = await webhooksRef.get();
    const webhooks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(webhooks);
  } catch (error) {
    console.error("Error fetching webhooks:", error);
    res.status(500).json({ message: "Error fetching webhooks" });
  }
});

// Export board (board + lists + cards + comments)
app.get('/api/boards/:boardId/export', async (req, res) => {
  try {
    const { boardId } = req.params;
    const boardRef = db.collection('boards').doc(boardId);
    const boardSnap = await boardRef.get();
    if (!boardSnap.exists) return res.status(404).json({ message: 'Board not found' });

    const listsSnap = await db.collection('lists').where('boardId', '==', boardId).get();
    const lists = listsSnap.docs.map(d => ({ listId: d.id, ...d.data() }));
    const listIds = lists.map(l => l.listId);

    let cards: any[] = [];
    if (listIds.length) {
      // Firestore in constraints: chunk by 10 if needed
      const chunks: string[][] = [];
      for (let i = 0; i < listIds.length; i += 10) chunks.push(listIds.slice(i, i + 10));
      for (const ch of chunks) {
        const snap = await db.collection('cards').where('listId', 'in', ch).get();
        cards = cards.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    }

    let comments: any[] = [];
    if (cards.length) {
      const cardIds = cards.map(c => c.id);
      // Not efficient cross-collection, but acceptable for export MVP (client can filter later)
      const snap = await db.collection('comments').where('cardId', 'in', cardIds.slice(0,10)).get().catch(()=>null);
      if (snap) comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Note: for >10 cardIds habría que paginar; MVP incluye comentarios del primer batch.
    }

    const board = { boardId: boardSnap.id, ...boardSnap.data() };
    res.json({ board, lists, cards, comments, exportedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Error exporting board:', error);
    res.status(500).json({ message: 'Error exporting board' });
  }
});

// Import board from JSON (expects shape returned by export)
app.post('/api/boards/import', async (req, res) => {
  try {
    const payload = req.body || {};
    const srcBoard = payload.board;
    const srcLists = Array.isArray(payload.lists) ? payload.lists : [];
    const srcCards = Array.isArray(payload.cards) ? payload.cards : [];
    if (!srcBoard || !srcBoard.name) {
      return res.status(400).json({ message: 'Invalid payload: board is required' });
    }

    // 1) Create new board
    const newBoardData = {
      name: srcBoard.name + ' (imported)',
      description: srcBoard.description || '',
      ownerId: srcBoard.ownerId || 'user-1',
      visibility: srcBoard.visibility || 'private',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const newBoardRef = await db.collection('boards').add(newBoardData);
    const newBoardId = newBoardRef.id;

    // 2) Create lists mapping
    const listIdMap = new Map<string, string>();
    for (const l of srcLists) {
      const data = {
        name: l.name,
        boardId: newBoardId,
        position: typeof l.position === 'number' ? l.position : 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const ref = await db.collection('lists').add(data);
      listIdMap.set(l.listId || l.id, ref.id);
    }

    // 3) Create cards with mapped listIds
    for (const c of srcCards) {
      const mappedListId = listIdMap.get(c.listId) || null;
      if (!mappedListId) continue;
      const cardData: any = {
        title: c.title || '',
        description: c.description || '',
        listId: mappedListId,
        assignedToUserId: c.assignedToUserId || '',
        estimatedTime: c.estimatedTime || 0,
        actualTime: c.actualTime || 0,
        position: typeof c.position === 'number' ? c.position : 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (c.dueDate) {
        const ts = toTimestamp(c.dueDate);
        if (ts) cardData.dueDate = ts;
      }
      if (Array.isArray(c.attachments)) cardData.attachments = c.attachments;
      await db.collection('cards').add(cardData);
    }

    res.status(201).json({ newBoardId });
  } catch (error) {
    console.error('Error importing board:', error);
    res.status(500).json({ message: 'Error importing board' });
  }
});
export default app;
