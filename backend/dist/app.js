"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const axios_1 = __importDefault(require("axios"));
const admin = __importStar(require("firebase-admin"));
const resolveStorageBucket = (serviceAccount) => {
    var _a, _b, _c;
    const explicit = (_a = process.env.FIREBASE_STORAGE_BUCKET) === null || _a === void 0 ? void 0 : _a.trim();
    if (explicit) {
        return explicit;
    }
    if ((_b = serviceAccount === null || serviceAccount === void 0 ? void 0 : serviceAccount.storageBucket) === null || _b === void 0 ? void 0 : _b.trim()) {
        return serviceAccount.storageBucket.trim();
    }
    const projectId = (_c = serviceAccount === null || serviceAccount === void 0 ? void 0 : serviceAccount.project_id) !== null && _c !== void 0 ? _c : process.env.FIREBASE_PROJECT_ID;
    if (projectId === null || projectId === void 0 ? void 0 : projectId.trim()) {
        return `${projectId.trim()}.appspot.com`;
    }
    return 'esencial-flow-uploads-1234';
};
const parseServiceAccount = (raw) => {
    const attempts = [];
    attempts.push(raw);
    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8');
        attempts.unshift(decoded);
    }
    catch (_a) { }
    for (const candidate of attempts) {
        if (!candidate || typeof candidate !== 'string') {
            continue;
        }
        let trimmed = candidate.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            trimmed = trimmed.slice(1, -1);
        }
        if (!trimmed.startsWith('{')) {
            continue;
        }
        try {
            return JSON.parse(trimmed);
        }
        catch (_b) { }
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
            const serviceAccount = require('./serviceAccountKey.json');
            const storageBucket = resolveStorageBucket(serviceAccount);
            admin.initializeApp(Object.assign({ credential: admin.credential.cert(serviceAccount) }, (storageBucket ? { storageBucket } : {})));
            console.log('Firebase Admin SDK initialized using local serviceAccountKey.json');
            if (!storageBucket) {
                console.warn('No storage bucket configured. Attachment endpoints will be unavailable.');
            }
            return;
        }
        catch (error) {
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
        admin.initializeApp(Object.assign({ credential: admin.credential.cert(parsed) }, (storageBucket ? { storageBucket } : {})));
        console.log('Firebase Admin SDK initialized successfully from environment variable.');
        if (!storageBucket) {
            console.warn('No storage bucket configured. Attachment endpoints will be unavailable.');
        }
    }
    catch (error) {
        console.error('Error initializing Firebase Admin SDK from environment variable:', error);
    }
};
initializeFirebaseAdmin();
const appInstance = admin.apps[0];
const configuredBucket = (_a = appInstance === null || appInstance === void 0 ? void 0 : appInstance.options) === null || _a === void 0 ? void 0 : _a.storageBucket;
const bucket = configuredBucket ? admin.storage().bucket(configuredBucket) : null;
if (!configuredBucket) {
    console.warn('Firebase storage bucket not configured. Attachment endpoints will be unavailable.');
}
const ensureBucketCors = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!bucket) {
        return;
    }
    const desiredOrigins = ['*'];
    const desiredRule = {
        origin: desiredOrigins,
        method: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE'],
        responseHeader: ['Content-Type', 'x-goog-resumable'],
        maxAgeSeconds: 3600,
    };
    try {
        const [metadata] = yield bucket.getMetadata();
        const existingCors = Array.isArray(metadata.cors) ? metadata.cors : [];
        const hasAllOrigins = existingCors.some((rule) => {
            const ruleOrigins = Array.isArray(rule === null || rule === void 0 ? void 0 : rule.origin) ? rule.origin : [];
            return ruleOrigins.includes('*') || desiredOrigins.every(origin => ruleOrigins.includes(origin));
        });
        if (hasAllOrigins) {
            return;
        }
        yield bucket.setMetadata({ cors: [desiredRule] });
        console.log('Updated storage bucket CORS configuration for web uploads.');
    }
    catch (error) {
        console.error('Could not ensure storage bucket CORS configuration:', error);
    }
});
void ensureBucketCors();
const db = admin.firestore();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PRIORITY_VALUES = ['low', 'medium', 'high'];
const sanitizePriority = (value, fallback = 'medium') => {
    if (typeof value === 'string' && PRIORITY_VALUES.includes(value)) {
        return value;
    }
    return fallback;
};
// Helpers
const toTimestamp = (value) => {
    if (!value)
        return undefined;
    // Already a Firestore Timestamp
    // @ts-ignore
    if (value instanceof admin.firestore.Timestamp)
        return value;
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
    if (isNaN(d.getTime()))
        return undefined;
    return admin.firestore.Timestamp.fromDate(d);
};
const buildDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};
const sanitizeDateParam = (value) => {
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
const fromFirestoreTimestamp = (value) => {
    if (!value)
        return null;
    if (value instanceof admin.firestore.Timestamp) {
        return value.toDate();
    }
    if (typeof value === 'object' && typeof value.seconds === 'number') {
        return new Date(value.seconds * 1000);
    }
    return null;
};
// Users API
app.get('/api/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const usersRef = db.collection('users');
        const snapshot = yield usersRef.get();
        const users = snapshot.docs.map(doc => (Object.assign({ userId: doc.id }, doc.data())));
        console.log(`[API] /api/users -> ${users.length} registros`);
        res.json(users);
    }
    catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users" });
    }
}));
// Habits API
app.get('/api/habits', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, includeArchived } = req.query;
        let habitsQuery = db.collection('habits');
        if (userId) {
            habitsQuery = habitsQuery.where('userId', '==', userId);
        }
        const snapshot = yield habitsQuery.get();
        const include = includeArchived === 'true';
        const habits = snapshot.docs
            .map(doc => (Object.assign({ id: doc.id }, doc.data())))
            .filter((habit) => include || !habit.archived);
        res.json(habits);
    }
    catch (error) {
        console.error('Error fetching habits:', error);
        res.status(500).json({ message: 'Error fetching habits' });
    }
}));
app.post('/api/habits', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const docRef = yield db.collection('habits').add(habitPayload);
        const saved = yield docRef.get();
        res.status(201).json(Object.assign({ id: docRef.id }, saved.data()));
    }
    catch (error) {
        console.error('Error creating habit:', error);
        res.status(500).json({ message: 'Error creating habit' });
    }
}));
app.put('/api/habits/:habitId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { habitId } = req.params;
        const { name, description, archived } = req.body || {};
        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
            return res.status(400).json({ message: 'name is required' });
        }
        const habitRef = db.collection('habits').doc(habitId);
        const snap = yield habitRef.get();
        if (!snap.exists) {
            return res.status(204).send();
        }
        const updatePayload = {
            name: trimmedName,
            description: typeof description === 'string' ? description.trim() : '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (typeof archived === 'boolean') {
            updatePayload.archived = archived;
        }
        yield habitRef.update(updatePayload);
        const updated = yield habitRef.get();
        res.json(Object.assign({ id: habitId }, updated.data()));
    }
    catch (error) {
        console.error('Error updating habit:', error);
        res.status(500).json({ message: 'Error updating habit' });
    }
}));
app.delete('/api/habits/:habitId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { habitId } = req.params;
        const habitRef = db.collection('habits').doc(habitId);
        const snap = yield habitRef.get();
        if (!snap.exists) {
            return res.status(404).json({ message: 'Habit not found' });
        }
        const completionsSnap = yield db
            .collection('habitCompletions')
            .where('habitId', '==', habitId)
            .get();
        const batch = db.batch();
        completionsSnap.docs.forEach(doc => batch.delete(doc.ref));
        batch.delete(habitRef);
        yield batch.commit();
        res.json({ id: habitId, deletedCompletions: completionsSnap.size });
    }
    catch (error) {
        console.error('Error deleting habit:', error);
        res.status(500).json({ message: 'Error deleting habit' });
    }
}));
app.get('/api/habits/daily', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, date } = req.query;
        const dateKey = sanitizeDateParam(date || null);
        if (!dateKey) {
            return res.status(400).json({ message: 'Invalid date parameter' });
        }
        let habitsQuery = db.collection('habits');
        if (userId) {
            habitsQuery = habitsQuery.where('userId', '==', userId);
        }
        const habitsSnapshot = yield habitsQuery.get();
        const activeHabits = habitsSnapshot.docs
            .map(doc => (Object.assign({ id: doc.id }, doc.data())))
            .filter((habit) => !habit.archived);
        if (!activeHabits.length) {
            return res.json([]);
        }
        let completionQuery = db.collection('habitCompletions').where('date', '==', dateKey);
        if (userId) {
            completionQuery = completionQuery.where('userId', '==', userId);
        }
        const completionsSnapshot = yield completionQuery.get();
        const completions = new Map();
        completionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data && data.habitId) {
                completions.set(data.habitId, Object.assign({ id: doc.id }, data));
            }
        });
        const payload = activeHabits.map((habit) => {
            const completion = completions.get(habit.id);
            const completedAt = completion ? fromFirestoreTimestamp(completion.completedAt) : null;
            return Object.assign(Object.assign({}, habit), { date: dateKey, completed: Boolean(completion), completedAt: completedAt ? completedAt.toISOString() : null });
        });
        res.json(payload);
    }
    catch (error) {
        console.error('Error fetching daily habits:', error);
        res.status(500).json({ message: 'Error fetching daily habits' });
    }
}));
app.post('/api/habits/:habitId/check', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { habitId } = req.params;
        const { date, userId } = req.body || {};
        const dateKey = sanitizeDateParam(date || null);
        if (!dateKey) {
            return res.status(400).json({ message: 'Invalid date parameter' });
        }
        const habitRef = db.collection('habits').doc(habitId);
        const habitSnap = yield habitRef.get();
        if (!habitSnap.exists) {
            return res.status(404).json({ message: 'Habit not found' });
        }
        const habitData = habitSnap.data();
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
        yield completionRef.set(completionPayload, { merge: true });
        const saved = yield completionRef.get();
        res.status(201).json(Object.assign({ id: completionRef.id }, saved.data()));
    }
    catch (error) {
        console.error('Error checking habit:', error);
        res.status(500).json({ message: 'Error checking habit' });
    }
}));
app.delete('/api/habits/:habitId/check', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { habitId } = req.params;
        const { date, userId } = req.query;
        const dateKey = sanitizeDateParam(date || null);
        if (!dateKey) {
            return res.status(400).json({ message: 'Invalid date parameter' });
        }
        const habitRef = db.collection('habits').doc(habitId);
        const habitSnap = yield habitRef.get();
        if (!habitSnap.exists) {
            return res.status(404).json({ message: 'Habit not found' });
        }
        const habitData = habitSnap.data();
        if (userId && habitData.userId && userId !== habitData.userId) {
            return res.status(403).json({ message: 'Habit does not belong to user' });
        }
        const completionId = `${habitId}_${dateKey}`;
        const completionRef = db.collection('habitCompletions').doc(completionId);
        const completionSnap = yield completionRef.get();
        if (!completionSnap.exists) {
            return res.status(204).send();
        }
        yield completionRef.delete();
        res.json({ id: completionId, habitId, date: dateKey });
    }
    catch (error) {
        console.error('Error unchecking habit:', error);
        res.status(500).json({ message: 'Error unchecking habit' });
    }
}));
// Boards API
app.get('/api/boards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const boardsRef = db.collection('boards');
        const snapshot = yield boardsRef.get();
        const boards = snapshot.docs.map(doc => (Object.assign({ boardId: doc.id }, doc.data())));
        console.log(`[API] /api/boards -> ${boards.length} registros`);
        res.json(boards);
    }
    catch (error) {
        console.error("Error fetching boards:", error);
        res.status(500).json({ message: "Error fetching boards" });
    }
}));
app.get('/api/boards/:boardId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { boardId } = req.params;
        const boardRef = db.collection('boards').doc(boardId);
        const doc = yield boardRef.get();
        if (!doc.exists) {
            res.status(404).json({ message: "Board not found" });
        }
        else {
            res.json(Object.assign({ boardId: doc.id }, doc.data()));
        }
    }
    catch (error) {
        console.error("Error fetching board:", error);
        res.status(500).json({ message: "Error fetching board" });
    }
}));
app.post('/api/boards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const newBoardData = Object.assign(Object.assign({}, req.body), { priority: sanitizePriority((_a = req.body) === null || _a === void 0 ? void 0 : _a.priority, 'medium'), createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        const docRef = yield db.collection('boards').add(newBoardData);
        const newBoard = Object.assign({ boardId: docRef.id }, newBoardData);
        res.status(201).json(newBoard);
    }
    catch (error) {
        console.error("Error creating board:", error);
        res.status(500).json({ message: "Error creating board" });
    }
}));
app.put('/api/boards/:boardId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { boardId } = req.params;
        const updatedBoardData = Object.assign(Object.assign(Object.assign({}, req.body), (Object.prototype.hasOwnProperty.call(req.body, 'priority')
            ? { priority: sanitizePriority(req.body.priority) }
            : {})), { updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        yield db.collection('boards').doc(boardId).update(updatedBoardData);
        res.json(Object.assign({ boardId: boardId }, updatedBoardData));
    }
    catch (error) {
        console.error("Error updating board:", error);
        res.status(500).json({ message: "Error updating board" });
    }
}));
app.delete('/api/boards/:boardId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { boardId } = req.params;
    const batch = db.batch();
    try {
        console.log(`Atomically deleting board ${boardId} and all its contents...`);
        // 1. Find all lists associated with the board
        const listsSnapshot = yield db.collection('lists').where('boardId', '==', boardId).get();
        // 2. For each list, find its cards and add both cards and list to the batch for deletion
        if (!listsSnapshot.empty) {
            console.log(`Found ${listsSnapshot.size} lists to delete.`);
            for (const listDoc of listsSnapshot.docs) {
                const listId = listDoc.id;
                const cardsSnapshot = yield db.collection('cards').where('listId', '==', listId).get();
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
        yield batch.commit();
        console.log(`Board ${boardId} and all its contents were deleted successfully.`);
        res.status(200).json({ message: "Board and its contents deleted successfully" });
    }
    catch (error) {
        console.error(`Failed to delete board ${boardId}:`, error);
        if (error instanceof Error) {
            res.status(500).json({ message: `Failed to delete board: ${error.message}` });
        }
        else {
            res.status(500).json({ message: 'An unknown error occurred' });
        }
    }
}));
// GET all cards for a specific board (efficiently)
app.get('/api/boards/:boardId/cards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { boardId } = req.params;
        // Find all lists for the given boardId
        const listsSnapshot = yield db.collection('lists').where('boardId', '==', boardId).get();
        if (listsSnapshot.empty) {
            return res.json([]);
        }
        const listIds = listsSnapshot.docs.map(doc => doc.id);
        // Find all cards that belong to any of those lists
        const cardsSnapshot = yield db.collection('cards').where('listId', 'in', listIds).get();
        const boardCards = cardsSnapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(boardCards);
    }
    catch (error) {
        console.error("Error fetching cards for board:", error);
        res.status(500).json({ message: "Error fetching cards for board" });
    }
}));
// Lists API
app.get('/api/boards/:boardId/lists', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { boardId } = req.params;
        const listsRef = db.collection('lists').where('boardId', '==', boardId);
        const snapshot = yield listsRef.orderBy('position').get();
        const lists = snapshot.docs.map(doc => (Object.assign({ listId: doc.id }, doc.data())));
        console.log(`[API] /api/boards/${boardId}/lists -> ${lists.length} registros`);
        res.json(lists);
    }
    catch (error) {
        console.error("Error fetching lists:", error);
        res.status(500).json({ message: "Error fetching lists" });
    }
}));
app.post('/api/boards/:boardId/lists', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { boardId } = req.params;
        const newListData = Object.assign(Object.assign({}, req.body), { boardId, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        const docRef = yield db.collection('lists').add(newListData);
        const newList = Object.assign({ id: docRef.id }, newListData);
        res.status(201).json(newList);
    }
    catch (error) {
        console.error("Error creating list:", error);
        res.status(500).json({ message: "Error creating list" });
    }
}));
app.put('/api/lists/:listId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listId } = req.params;
        const updatedListData = Object.assign(Object.assign({}, req.body), { updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        yield db.collection('lists').doc(listId).update(updatedListData);
        res.json(Object.assign({ id: listId }, updatedListData));
    }
    catch (error) {
        console.error("Error updating list:", error);
        res.status(500).json({ message: "Error updating list" });
    }
}));
app.delete('/api/lists/:listId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listId } = req.params;
        const batch = db.batch();
        // Delete associated cards
        const cardsSnapshot = yield db.collection('cards').where('listId', '==', listId).get();
        for (const cardDoc of cardsSnapshot.docs) {
            batch.delete(cardDoc.ref);
        }
        // Delete the list itself
        batch.delete(db.collection('lists').doc(listId));
        yield batch.commit();
        res.json({ message: "List and associated cards deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting list:", error);
        res.status(500).json({ message: "Error deleting list" });
    }
}));
// Cards API
app.get('/api/cards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const cardsRef = db.collection('cards');
        const snapshot = yield cardsRef.get();
        const cards = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(cards);
    }
    catch (error) {
        console.error("Error fetching cards:", error);
        res.status(500).json({ message: "Error fetching cards" });
    }
}));
app.get('/api/cards/today', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const cardsRef = db.collection('cards');
        const snapshot = yield cardsRef
            .where('dueDate', '>=', today)
            .where('dueDate', '<', tomorrow)
            .get();
        const todayCards = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(todayCards);
    }
    catch (error) {
        console.error("Error fetching today's cards:", error);
        res.status(500).json({ message: "Error fetching today's cards" });
    }
}));
// Flexible search by due date range, optionally filter by userId
app.get('/api/cards/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { start, end, userId } = req.query;
        if (!start || !end) {
            return res.status(400).json({ message: 'start and end query params are required (ISO strings)' });
        }
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ message: 'invalid start or end date' });
        }
        const snapshot = yield db
            .collection('cards')
            .where('dueDate', '>=', startDate)
            .where('dueDate', '<', endDate)
            .get();
        let cards = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        if (userId) {
            cards = cards.filter((c) => c.assignedToUserId === userId);
        }
        res.json(cards);
    }
    catch (error) {
        console.error('Error searching cards by due date:', error);
        res.status(500).json({ message: 'Error searching cards' });
    }
}));
app.get('/api/lists/:listId/cards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listId } = req.params;
        const cardsRef = db.collection('cards').where('listId', '==', listId);
        const snapshot = yield cardsRef.get();
        const cards = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(cards);
    }
    catch (error) {
        console.error("Error fetching cards for list:", error);
        res.status(500).json({ message: "Error fetching cards for list" });
    }
}));
app.post('/api/lists/:listId/cards', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listId } = req.params;
        const incoming = Object.assign({}, req.body);
        if (incoming.dueDate) {
            const ts = toTimestamp(incoming.dueDate);
            if (ts)
                incoming.dueDate = ts;
        }
        const priority = sanitizePriority(incoming.priority, 'medium');
        delete incoming.priority;
        // Determine position at end of list if not provided
        let position = incoming.position;
        if (position === undefined) {
            const countSnap = yield db.collection('cards').where('listId', '==', listId).get();
            position = countSnap.size; // append to end
        }
        const newCardData = Object.assign(Object.assign({}, incoming), { position,
            listId,
            priority, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        const docRef = yield db.collection('cards').add(newCardData);
        const newCard = Object.assign({ id: docRef.id }, newCardData);
        res.status(201).json(newCard);
        // Trigger webhooks for card_created event
        const webhooksSnapshot = yield db.collection('webhooks').where('triggerEvent', '==', 'card_created').get();
        webhooksSnapshot.docs.forEach((doc) => __awaiter(void 0, void 0, void 0, function* () {
            const webhook = doc.data();
            try {
                yield axios_1.default.post(webhook.url, { event: 'card_created', card: newCard });
                console.log(`Webhook for card_created sent to ${webhook.url}`);
            }
            catch (webhookError) {
                console.error(`Error sending webhook to ${webhook.url}:`, webhookError);
            }
        }));
    }
    catch (error) {
        console.error("Error creating card:", error);
        res.status(500).json({ message: "Error creating card" });
    }
}));
app.put('/api/cards/:cardId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId } = req.params;
        const incoming = Object.assign({}, req.body);
        if (incoming.dueDate) {
            const ts = toTimestamp(incoming.dueDate);
            if (ts)
                incoming.dueDate = ts;
        }
        if (Object.prototype.hasOwnProperty.call(incoming, 'priority')) {
            incoming.priority = sanitizePriority(incoming.priority);
        }
        const updatedCardData = Object.assign(Object.assign({}, incoming), { updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        yield db.collection('cards').doc(cardId).update(updatedCardData);
        res.json(Object.assign({ id: cardId }, updatedCardData));
    }
    catch (error) {
        console.error("Error updating card:", error);
        res.status(500).json({ message: "Error updating card" });
    }
}));
app.patch('/api/cards/:cardId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId } = req.params;
        const incoming = Object.assign({}, req.body);
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
            if (ts)
                incoming.dueDate = ts;
        }
        if (Object.prototype.hasOwnProperty.call(incoming, 'priority')) {
            incoming.priority = sanitizePriority(incoming.priority);
        }
        const updatedFields = Object.assign(Object.assign({}, incoming), { updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        const oldCardDoc = yield db.collection('cards').doc(cardId).get();
        const oldCardData = oldCardDoc.data();
        // Trigger webhooks for card_moved event if listId changed
        if (oldCardData && oldCardData.listId !== updatedFields.listId) {
            const webhooksSnapshot = yield db.collection('webhooks').where('triggerEvent', '==', 'card_moved').get();
            webhooksSnapshot.docs.forEach((doc) => __awaiter(void 0, void 0, void 0, function* () {
                const webhook = doc.data();
                try {
                    yield axios_1.default.post(webhook.url, { event: 'card_moved', cardId, oldListId: oldCardData.listId, newListId: updatedFields.listId, card: Object.assign({ id: cardId }, updatedFields) });
                    console.log(`Webhook for card_moved sent to ${webhook.url}`);
                }
                catch (webhookError) {
                    console.error(`Error sending webhook to ${webhook.url}:`, webhookError);
                }
            }));
        }
        yield db.collection('cards').doc(cardId).update(updatedFields);
        res.json(Object.assign({ id: cardId }, updatedFields));
    }
    catch (error) {
        console.error("Error patching card:", error);
        res.status(500).json({ message: "Error patching card" });
    }
}));
app.delete('/api/cards/:cardId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId } = req.params;
        yield db.collection('cards').doc(cardId).delete();
        res.json({ message: "Card deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting card:", error);
        res.status(500).json({ message: "Error deleting card" });
    }
}));
// Attachments API
app.post('/api/cards/:cardId/request-upload-url', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    };
    try {
        const [signedUrl] = yield file.getSignedUrl(options);
        res.status(200).json({ signedUrl, filePath });
    }
    catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ message: 'Could not generate upload URL.' });
    }
}));
app.post('/api/cards/:cardId/attachments', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cardId } = req.params;
    const attachmentData = req.body;
    try {
        const cardRef = db.collection('cards').doc(cardId);
        // Firestore no permite serverTimestamp dentro de arrayUnion: usar Timestamp.now()
        if (!attachmentData || !attachmentData.attachmentId || !attachmentData.fileName || !attachmentData.url) {
            return res.status(400).json({ message: 'Invalid attachment payload' });
        }
        const newAttachment = Object.assign(Object.assign({}, attachmentData), { createdAt: admin.firestore.Timestamp.now() });
        yield cardRef.set({ attachments: admin.firestore.FieldValue.arrayUnion(newAttachment) }, { merge: true });
        res.status(201).json(newAttachment);
    }
    catch (error) {
        console.error('Error adding attachment to card:', error);
        res.status(500).json({ message: 'Could not add attachment.' });
    }
}));
// Generate a temporary READ URL for an attachment (so you can open without making it public)
app.get('/api/cards/:cardId/attachments/signed-read', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const filePath = String(req.query.filePath || '');
        if (!filePath) {
            return res.status(400).json({ message: 'filePath is required' });
        }
        if (!bucket) {
            return res.status(503).json({ message: 'Storage bucket not configured.' });
        }
        const file = bucket.file(filePath);
        const [url] = yield file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 10 * 60 * 1000, // 10 minutes
        });
        res.json({ url });
    }
    catch (error) {
        console.error('Error generating signed READ URL:', error);
        res.status(500).json({ message: 'Could not generate signed READ URL.' });
    }
}));
// Remove an attachment from a card (and optionally delete the object in GCS)
app.delete('/api/cards/:cardId/attachments/:attachmentId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cardId, attachmentId } = req.params;
    const { deleteObject } = req.query;
    try {
        const cardRef = db.collection('cards').doc(cardId);
        const snap = yield cardRef.get();
        if (!snap.exists) {
            return res.status(404).json({ message: 'Card not found' });
        }
        const data = snap.data();
        const attachments = Array.isArray(data === null || data === void 0 ? void 0 : data.attachments) ? data.attachments : [];
        const toRemove = attachments.find(a => a.attachmentId === attachmentId);
        if (!toRemove) {
            return res.status(404).json({ message: 'Attachment not found' });
        }
        const remaining = attachments.filter(a => a.attachmentId !== attachmentId);
        yield cardRef.update({ attachments: remaining });
        if (deleteObject === 'true' || deleteObject === '1') {
            if (!bucket) {
                console.warn('Storage bucket not configured; skipping object deletion.');
            }
            else {
                try {
                    yield bucket.file(attachmentId).delete({ ignoreNotFound: true });
                }
                catch (e) {
                    console.error('Failed deleting object from bucket:', e);
                    // do not fail the request if object deletion fails
                }
            }
        }
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Error deleting attachment:', error);
        res.status(500).json({ message: 'Could not delete attachment.' });
    }
}));
// Batch reorder cards (position and optional listId) for performance
app.post('/api/cards/reorder-batch', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const updates = req.body && Array.isArray(req.body.updates) ? req.body.updates : null;
        if (!updates || updates.length === 0) {
            return res.status(400).json({ message: 'updates array is required' });
        }
        const batch = db.batch();
        for (const u of updates) {
            if (!u.cardId || typeof u.position !== 'number')
                continue;
            const ref = db.collection('cards').doc(String(u.cardId));
            const payload = {
                position: u.position,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (u.listId)
                payload.listId = String(u.listId);
            batch.update(ref, payload);
        }
        yield batch.commit();
        res.json({ ok: true, count: updates.length });
    }
    catch (error) {
        console.error('Error in reorder-batch:', error);
        res.status(500).json({ message: 'Error reordering cards' });
    }
}));
// Timer Sessions API
app.post('/api/timer-sessions', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const newSessionData = Object.assign(Object.assign({}, req.body), { startTime: admin.firestore.FieldValue.serverTimestamp() });
        const docRef = yield db.collection('timerSessions').add(newSessionData);
        const newSession = Object.assign({ id: docRef.id }, newSessionData);
        res.status(201).json(newSession);
    }
    catch (error) {
        console.error("Error creating timer session:", error);
        res.status(500).json({ message: "Error creating timer session" });
    }
}));
app.patch('/api/timer-sessions/:sessionId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId } = req.params;
        const updatedSessionData = Object.assign(Object.assign({}, req.body), { endTime: admin.firestore.FieldValue.serverTimestamp() });
        yield db.collection('timerSessions').doc(sessionId).update(updatedSessionData);
        res.json(Object.assign({ id: sessionId }, updatedSessionData));
    }
    catch (error) {
        console.error("Error updating timer session:", error);
        res.status(500).json({ message: "Error updating timer session" });
    }
}));
// Webhooks API
app.post('/api/webhooks', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const newWebhookData = Object.assign(Object.assign({}, req.body), { createdAt: admin.firestore.FieldValue.serverTimestamp() });
        const docRef = yield db.collection('webhooks').add(newWebhookData);
        const newWebhook = Object.assign({ id: docRef.id }, newWebhookData);
        res.status(201).json(newWebhook);
    }
    catch (error) {
        console.error("Error creating webhook:", error);
        res.status(500).json({ message: "Error creating webhook" });
    }
}));
// Comments API
app.get('/api/cards/:cardId/comments', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId } = req.params;
        const snapshot = yield db
            .collection('comments')
            .where('cardId', '==', cardId)
            .get();
        const comments = snapshot.docs
            .map(doc => (Object.assign({ id: doc.id }, doc.data())))
            .sort((a, b) => {
            var _a, _b;
            const aa = ((_a = a.createdAt) === null || _a === void 0 ? void 0 : _a._seconds) ? a.createdAt._seconds : 0;
            const bb = ((_b = b.createdAt) === null || _b === void 0 ? void 0 : _b._seconds) ? b.createdAt._seconds : 0;
            return aa - bb;
        });
        res.json(comments);
    }
    catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Error fetching comments' });
    }
}));
app.post('/api/cards/:cardId/comments', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const ref = yield db.collection('comments').add(newComment);
        // fetch saved doc to return resolved timestamps instead of FieldValue sentinel
        const saved = yield ref.get();
        // Notificaciones por menciones (simple: persistimos en colección notifications)
        try {
            const m = Array.isArray(mentions) ? mentions : [];
            if (m.length) {
                const batch = db.batch();
                m.forEach((uid) => {
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
                yield batch.commit();
            }
        }
        catch (e) {
            console.warn('Failed creating mention notifications:', e);
        }
        res.status(201).json(Object.assign({ id: ref.id }, saved.data()));
    }
    catch (error) {
        console.error('Error creating comment:', error);
        res.status(500).json({ message: 'Error creating comment' });
    }
}));
app.put('/api/cards/:cardId/comments/:commentId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId, commentId } = req.params;
        const { text, mentions } = req.body || {};
        if (!text) {
            return res.status(400).json({ message: 'text is required' });
        }
        const ref = db.collection('comments').doc(commentId);
        const snap = yield ref.get();
        if (!snap.exists) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        const data = snap.data();
        if (data.cardId !== cardId) {
            return res.status(400).json({ message: 'Comment does not belong to this card' });
        }
        const updated = { text, mentions: Array.isArray(mentions) ? mentions : data.mentions || [], updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        yield ref.update(updated);
        // Notificaciones por nuevas menciones (no intentamos diferenciar, notificamos a todos los incluidos)
        try {
            const m = Array.isArray(mentions) ? mentions : [];
            if (m.length) {
                const batch = db.batch();
                m.forEach((uid) => {
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
                yield batch.commit();
            }
        }
        catch (e) {
            console.warn('Failed creating mention notifications on edit:', e);
        }
        res.json(Object.assign(Object.assign({ id: commentId }, data), updated));
    }
    catch (error) {
        console.error('Error updating comment:', error);
        res.status(500).json({ message: 'Error updating comment' });
    }
}));
app.delete('/api/cards/:cardId/comments/:commentId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId, commentId } = req.params;
        const ref = db.collection('comments').doc(commentId);
        const snap = yield ref.get();
        if (!snap.exists) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        const data = snap.data();
        if (data.cardId !== cardId) {
            console.warn(`Comment ${commentId} belongs to ${data.cardId} not ${cardId}. Deleting anyway.`);
        }
        yield ref.delete();
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ message: 'Error deleting comment' });
    }
}));
app.get('/api/webhooks', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const webhooksRef = db.collection('webhooks');
        const snapshot = yield webhooksRef.get();
        const webhooks = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(webhooks);
    }
    catch (error) {
        console.error("Error fetching webhooks:", error);
        res.status(500).json({ message: "Error fetching webhooks" });
    }
}));
// Export board (board + lists + cards + comments)
app.get('/api/boards/:boardId/export', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { boardId } = req.params;
        const boardRef = db.collection('boards').doc(boardId);
        const boardSnap = yield boardRef.get();
        if (!boardSnap.exists)
            return res.status(404).json({ message: 'Board not found' });
        const listsSnap = yield db.collection('lists').where('boardId', '==', boardId).get();
        const lists = listsSnap.docs.map(d => (Object.assign({ listId: d.id }, d.data())));
        const listIds = lists.map(l => l.listId);
        let cards = [];
        if (listIds.length) {
            // Firestore in constraints: chunk by 10 if needed
            const chunks = [];
            for (let i = 0; i < listIds.length; i += 10)
                chunks.push(listIds.slice(i, i + 10));
            for (const ch of chunks) {
                const snap = yield db.collection('cards').where('listId', 'in', ch).get();
                cards = cards.concat(snap.docs.map(d => (Object.assign({ id: d.id }, d.data()))));
            }
        }
        let comments = [];
        if (cards.length) {
            const cardIds = cards.map(c => c.id);
            // Not efficient cross-collection, but acceptable for export MVP (client can filter later)
            const snap = yield db.collection('comments').where('cardId', 'in', cardIds.slice(0, 10)).get().catch(() => null);
            if (snap)
                comments = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
            // Note: for >10 cardIds habría que paginar; MVP incluye comentarios del primer batch.
        }
        const board = Object.assign({ boardId: boardSnap.id }, boardSnap.data());
        res.json({ board, lists, cards, comments, exportedAt: new Date().toISOString() });
    }
    catch (error) {
        console.error('Error exporting board:', error);
        res.status(500).json({ message: 'Error exporting board' });
    }
}));
// Import board from JSON (expects shape returned by export)
app.post('/api/boards/import', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const newBoardRef = yield db.collection('boards').add(newBoardData);
        const newBoardId = newBoardRef.id;
        // 2) Create lists mapping
        const listIdMap = new Map();
        for (const l of srcLists) {
            const data = {
                name: l.name,
                boardId: newBoardId,
                position: typeof l.position === 'number' ? l.position : 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            const ref = yield db.collection('lists').add(data);
            listIdMap.set(l.listId || l.id, ref.id);
        }
        // 3) Create cards with mapped listIds
        for (const c of srcCards) {
            const mappedListId = listIdMap.get(c.listId) || null;
            if (!mappedListId)
                continue;
            const cardData = {
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
                if (ts)
                    cardData.dueDate = ts;
            }
            if (Array.isArray(c.attachments))
                cardData.attachments = c.attachments;
            yield db.collection('cards').add(cardData);
        }
        res.status(201).json({ newBoardId });
    }
    catch (error) {
        console.error('Error importing board:', error);
        res.status(500).json({ message: 'Error importing board' });
    }
}));
exports.default = app;
