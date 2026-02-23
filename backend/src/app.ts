import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

type ServiceAccountShape = {
  project_id?: string;
  storageBucket?: string;
};

type UserRole = 'admin' | 'member' | 'manager' | 'client';

type AuthedUserProfile = {
  userId: string;
  role: UserRole;
  allowedBoardIds?: string[];
  [key: string]: unknown;
};

type AuthedRequest = express.Request & {
  user?: admin.auth.DecodedIdToken;
  authedUser?: AuthedUserProfile | null;
};

const DEFAULT_USER_ROLE: UserRole = 'member';
const CLIENT_USER_ROLE: UserRole = 'client';

const normalizeUserRole = (value: unknown): UserRole => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'admin' || normalized === 'administrator') return 'admin';
    if (normalized === 'manager' || normalized === 'gestor' || normalized === 'coordinator') return 'manager';
    if (normalized === 'client' || normalized === 'cliente' || normalized === 'customer') return 'client';
    if (normalized === 'member' || normalized === 'usuario' || normalized === 'user' || normalized === 'miembro') {
      return 'member';
    }
  }
  return DEFAULT_USER_ROLE;
};

const normalizeAllowedIds = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return list.length ? list : undefined;
};

const getAuthedUserFromRequest = (req: AuthedRequest): AuthedUserProfile | null =>
  req.authedUser ?? null;

const getAllowedBoardIdsFromRequest = (req: AuthedRequest): string[] | undefined =>
  getAuthedUserFromRequest(req)?.allowedBoardIds;

const isClientUser = (req: AuthedRequest): boolean =>
  getAuthedUserFromRequest(req)?.role === CLIENT_USER_ROLE;

const ensureNonClientUser = (req: AuthedRequest, res: express.Response): boolean => {
  if (isClientUser(req)) {
    res.status(403).json({ message: 'Operation not permitted for client users' });
    return false;
  }
  return true;
};

const getUserIdFromRequest = (req: AuthedRequest): string | null => {
  const uid = req.user?.uid;
  if (typeof uid === 'string' && uid.trim()) {
    return uid.trim();
  }
  return null;
};

const extractIdsFromUnknown = (value: unknown): string[] => {
  if (!value) return [];
  const ids: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        ids.push(item.trim());
        continue;
      }
      if (item && typeof item === 'object') {
        const candidate = (item as { userId?: unknown; uid?: unknown; id?: unknown });
        if (typeof candidate.userId === 'string' && candidate.userId.trim()) {
          ids.push(candidate.userId.trim());
        }
        if (typeof candidate.uid === 'string' && candidate.uid.trim()) {
          ids.push(candidate.uid.trim());
        }
        if (typeof candidate.id === 'string' && candidate.id.trim()) {
          ids.push(candidate.id.trim());
        }
      }
    }
    return ids;
  }

  if (typeof value === 'object') {
    for (const maybe of Object.values(value as Record<string, unknown>)) {
      if (typeof maybe === 'string' && maybe.trim()) {
        ids.push(maybe.trim());
      } else if (maybe && typeof maybe === 'object') {
        const nested = extractIdsFromUnknown(maybe);
        ids.push(...nested);
      }
    }
  }

  return ids;
};

const collectBoardMemberIds = (board: Record<string, unknown>): string[] => {
  const candidates = ['memberIds', 'members', 'collaboratorIds', 'sharedWithUserIds', 'participantIds', 'userIds', 'users'];
  const unique = new Set<string>();

  const ownerId = board?.ownerId;
  if (typeof ownerId === 'string' && ownerId.trim()) {
    unique.add(ownerId.trim());
  }

  for (const field of candidates) {
    if (!Object.prototype.hasOwnProperty.call(board, field)) {
      continue;
    }
    const value = (board as Record<string, unknown>)[field];
    for (const id of extractIdsFromUnknown(value)) {
      if (id) {
        unique.add(id);
      }
    }
  }

  return Array.from(unique);
};

const userHasBoardAccess = (
  board: Record<string, unknown>,
  userId: string,
  userEmail?: string | null,
  allowedBoardIds?: string[]
): boolean => {
  if (allowedBoardIds && allowedBoardIds.length) {
    const candidateBoardId =
      typeof board.boardId === 'string'
        ? board.boardId.trim()
        : typeof (board as any).id === 'string'
          ? String((board as any).id).trim()
          : '';
    if (!candidateBoardId || !allowedBoardIds.includes(candidateBoardId)) {
      return false;
    }
  }

  if (userId) {
    const members = collectBoardMemberIds(board);
    if (members.includes(userId)) {
      return true;
    }
  }

  if (userEmail) {
    const normalizedEmail = userEmail.trim().toLowerCase();
    if (normalizedEmail) {
      const emailCandidates: unknown[] = [];
      if (typeof board.ownerEmail === 'string') emailCandidates.push(board.ownerEmail);
      if (typeof (board as any).createdByEmail === 'string') emailCandidates.push((board as any).createdByEmail);
      if ((board as any).owner && typeof (board as any).owner === 'object') {
        const ownerObj = (board as any).owner as { email?: unknown };
        if (typeof ownerObj.email === 'string') {
          emailCandidates.push(ownerObj.email);
        }
      }
      if (Array.isArray((board as any).members)) {
        for (const member of (board as any).members as any[]) {
          if (member && typeof member === 'object') {
            if (typeof member.email === 'string') {
              emailCandidates.push(member.email);
            }
          }
        }
      }
      if (emailCandidates.some(val => typeof val === 'string' && val.trim().toLowerCase() === normalizedEmail)) {
        return true;
      }
    }
  }

  return false;
};

const sanitizeMemberIds = (incoming: unknown, ownerId: string): string[] => {
  const ids = new Set<string>();
  for (const id of extractIdsFromUnknown(incoming)) {
    if (id) {
      ids.add(id);
    }
  }
  if (ownerId) {
    ids.add(ownerId);
  }
  return Array.from(ids);
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
  } catch { }

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
      return JSON.parse(trimmed) as ServiceAccountShape & admin.ServiceAccount;
    } catch { }
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
      const candidatePaths = [
        path.join(__dirname, 'serviceAccountKey.json'),
        path.join(__dirname, '../src/serviceAccountKey.json'),
        path.join(process.cwd(), 'serviceAccountKey.json')
      ];
      let serviceAccount: ServiceAccountShape | null = null;
      let resolvedPath = '';
      for (const candidate of candidatePaths) {
        try {
          if (fs.existsSync(candidate)) {
            const raw = fs.readFileSync(candidate, 'utf8');
            serviceAccount = JSON.parse(raw) as ServiceAccountShape;
            resolvedPath = candidate;
            break;
          }
        } catch {
          // continue checking other paths
        }
      }
      if (!serviceAccount) {
        throw new Error('serviceAccountKey.json not found');
      }
      const storageBucket = resolveStorageBucket(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        ...(storageBucket ? { storageBucket } : {}),
      });
      console.log(`Firebase Admin SDK initialized using local serviceAccountKey.json (${resolvedPath})`);
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

const ensureBucketCors = async () => {
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
    const [metadata] = await bucket.getMetadata();
    const existingCors = Array.isArray(metadata.cors) ? metadata.cors : [];
    const hasAllOrigins = existingCors.some((rule: any) => {
      const ruleOrigins = Array.isArray(rule?.origin) ? rule.origin : [];
      return ruleOrigins.includes('*') || desiredOrigins.every(origin => ruleOrigins.includes(origin));
    });
    if (hasAllOrigins) {
      return;
    }
    await bucket.setMetadata({ cors: [desiredRule] });
    console.log('Updated storage bucket CORS configuration for web uploads.');
  } catch (error) {
    console.error('Could not ensure storage bucket CORS configuration:', error);
  }
};

void ensureBucketCors();

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

const requireAuth: express.RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or invalid auth token' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ message: 'Missing or invalid auth token' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const authedReq = req as AuthedRequest;
    authedReq.user = decoded;

    try {
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      if (userDoc.exists) {
        const rawData = userDoc.data() ?? {};
        const role = normalizeUserRole((rawData as Record<string, unknown>).role);
        const allowedBoardIds = normalizeAllowedIds((rawData as Record<string, unknown>).allowedBoardIds);
        authedReq.authedUser = {
          ...(rawData as Record<string, unknown>),
          userId: decoded.uid,
          role,
          ...(allowedBoardIds ? { allowedBoardIds } : {}),
        };
      } else {
        authedReq.authedUser = { userId: decoded.uid, role: DEFAULT_USER_ROLE };
      }
    } catch (profileError) {
      console.error('Could not load user profile from Firestore:', profileError);
      (req as AuthedRequest).authedUser = { userId: decoded.uid, role: DEFAULT_USER_ROLE };
    }

    next();
  } catch (error) {
    console.error('Invalid auth token:', error);
    res.status(401).json({ message: 'Invalid auth token' });
  }
};

app.use('/api', requireAuth);

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
    console.log(`[API] /api/users -> ${users.length} registros`);
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.get('/api/me', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const profile = getAuthedUserFromRequest(authedReq);
  if (!profile) {
    res.status(404).json({ message: 'User profile not found' });
    return;
  }
  const { userId, role, allowedBoardIds, ...rest } = profile;
  const payload: Record<string, unknown> = {
    userId,
    role,
  };
  if (allowedBoardIds && allowedBoardIds.length) {
    payload.allowedBoardIds = allowedBoardIds;
  }
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || key === 'userId' || key === 'role' || key === 'allowedBoardIds') {
      continue;
    }
    payload[key] = value;
  }
  res.json(payload);
});

// Habits API
app.get('/api/habits', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
  const ownerId = requestedUserId || getUserIdFromRequest(authedReq);
  if (!ownerId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    const { includeArchived } = req.query as { includeArchived?: string };
    let habitsQuery: admin.firestore.Query = db.collection('habits').where('userId', '==', ownerId);
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  try {
    const { name, description, userId } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const ownerId = typeof userId === 'string' && userId.trim() ? userId.trim() : getUserIdFromRequest(authedReq);
    if (!trimmedName || !ownerId) {
      return res.status(400).json({ message: 'name and userId are required' });
    }

    const habitPayload = {
      name: trimmedName,
      description: typeof description === 'string' ? description.trim() : '',
      userId: ownerId,
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
    const habitData = snap.data() as any;
    const ownerId = habitData?.userId;
    const authedUserId = getUserIdFromRequest(authedReq);
    if (!authedUserId || (ownerId && authedUserId !== ownerId)) {
      return res.status(403).json({ message: 'Habit does not belong to user' });
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  try {
    const { habitId } = req.params;
    const habitRef = db.collection('habits').doc(habitId);
    const snap = await habitRef.get();
    if (!snap.exists) {
      return res.status(404).json({ message: 'Habit not found' });
    }
    const habitData = snap.data() as any;
    const ownerId = habitData?.userId;
    const authedUserId = getUserIdFromRequest(authedReq);
    if (!authedUserId || (ownerId && authedUserId !== ownerId)) {
      return res.status(403).json({ message: 'Habit does not belong to user' });
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
  const authedReq = req as AuthedRequest;
  try {
    const { userId, date } = req.query as { userId?: string; date?: string };
    const ownerId = typeof userId === 'string' && userId.trim() ? userId.trim() : getUserIdFromRequest(authedReq);
    if (!ownerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const dateKey = sanitizeDateParam(date || null);
    if (!dateKey) {
      return res.status(400).json({ message: 'Invalid date parameter' });
    }

    let habitsQuery: admin.firestore.Query = db.collection('habits').where('userId', '==', ownerId);
    const habitsSnapshot = await habitsQuery.get();
    const activeHabits = habitsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((habit: any) => !habit.archived);

    if (!activeHabits.length) {
      return res.json([]);
    }

    let completionQuery = db.collection('habitCompletions')
      .where('date', '==', dateKey)
      .where('userId', '==', ownerId);
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  try {
    const { habitId } = req.params;
    const { date, userId } = req.body || {};
    const actingUserId = getUserIdFromRequest(authedReq);
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
    const ownerId = habitData?.userId;
    const finalUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : actingUserId;
    if (!finalUserId || (ownerId && finalUserId !== ownerId)) {
      return res.status(403).json({ message: 'Habit does not belong to user' });
    }

    const completionId = `${habitId}_${dateKey}`;
    const completionRef = db.collection('habitCompletions').doc(completionId);
    const completionPayload = {
      habitId,
      userId: ownerId,
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  try {
    const { habitId } = req.params;
    const { date, userId } = req.query as { date?: string; userId?: string };
    const actingUserId = getUserIdFromRequest(authedReq);
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
    const ownerId = habitData?.userId;
    const finalUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : actingUserId;
    if (!finalUserId || (ownerId && finalUserId !== ownerId)) {
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
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  const userEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email : null;
  const allowedBoardIds = getAllowedBoardIdsFromRequest(authedReq);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const boardsRef = db.collection('boards');
    const snapshot = await boardsRef.get();
    const boards = snapshot.docs
      .map(doc => {
        const data = doc.data() ?? {};
        return { boardId: doc.id, ...data };
      })
      .filter(board => userHasBoardAccess(board, userId, userEmail, allowedBoardIds));
    console.log(`[API] /api/boards -> ${boards.length} registros visibles para ${userId}`);
    res.json(boards);
  } catch (error) {
    console.error("Error fetching boards:", error);
    res.status(500).json({ message: "Error fetching boards" });
  }
});

app.get('/api/boards/:boardId', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  const userEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email : null;
  const allowedBoardIds = getAllowedBoardIdsFromRequest(authedReq);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const { boardId } = req.params;
    const boardRef = db.collection('boards').doc(boardId);
    const doc = await boardRef.get();
    if (!doc.exists) {
      res.status(404).json({ message: "Board not found" });
      return;
    }
    const boardData = { boardId: doc.id, ...doc.data() };
    if (!userHasBoardAccess(boardData, userId, userEmail, allowedBoardIds)) {
      res.status(403).json({ message: 'Board not accessible' });
      return;
    }
    res.json(boardData);
  } catch (error) {
    console.error("Error fetching board:", error);
    res.status(500).json({ message: "Error fetching board" });
  }
});

app.post('/api/boards', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Nuevo tablero';
    const description = typeof body.description === 'string' ? body.description : '';
    const visibility = body.visibility === 'public' ? 'public' : 'private';
    const memberIds = sanitizeMemberIds((body as Record<string, unknown>).memberIds, userId);
    const priority = sanitizePriority((body as any)?.priority, 'medium');
    const ownerEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email.trim().toLowerCase() : null;

    const newBoardData = {
      name,
      description,
      visibility,
      ownerId: userId,
      memberIds,
      priority,
      ...(ownerEmail ? { ownerEmail } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('boards').add(newBoardData);
    const created = await docRef.get();
    res.status(201).json({ boardId: docRef.id, ...created.data() });
  } catch (error) {
    console.error("Error creating board:", error);
    res.status(500).json({ message: "Error creating board" });
  }
});

app.put('/api/boards/:boardId', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const { boardId } = req.params;
    const boardRef = db.collection('boards').doc(boardId);
    const snap = await boardRef.get();
    if (!snap.exists) {
      res.status(404).json({ message: "Board not found" });
      return;
    }
    const existing = snap.data() ?? {};
    if ((existing as any).ownerId !== userId) {
      res.status(403).json({ message: "Only the owner can update this board" });
      return;
    }

    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(body, 'name') && typeof body.name === 'string') {
      updates.name = body.name.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'description') && typeof body.description === 'string') {
      updates.description = body.description;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'visibility') && body.visibility === 'public') {
      updates.visibility = 'public';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'visibility') && body.visibility !== 'public') {
      updates.visibility = 'private';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
      updates.priority = sanitizePriority((body as any).priority);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'memberIds')) {
      updates.memberIds = sanitizeMemberIds((body as Record<string, unknown>).memberIds, userId);
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await boardRef.update(updates);
    const updatedSnap = await boardRef.get();
    res.json({ boardId, ...updatedSnap.data() });
  } catch (error) {
    console.error("Error updating board:", error);
    res.status(500).json({ message: "Error updating board" });
  }
});

app.delete('/api/boards/:boardId', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const { boardId } = req.params;
  const boardRef = db.collection('boards').doc(boardId);
  const snapshot = await boardRef.get();
  if (!snapshot.exists) {
    res.status(404).json({ message: 'Board not found' });
    return;
  }
  const data = snapshot.data() ?? {};
  if ((data as any).ownerId !== userId) {
    res.status(403).json({ message: 'Only the owner can delete this board' });
    return;
  }

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
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  const userEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email : null;
  const allowedBoardIds = getAllowedBoardIdsFromRequest(authedReq);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const { boardId } = req.params;
    const boardSnap = await db.collection('boards').doc(boardId).get();
    if (!boardSnap.exists) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }
    const boardData = { boardId, ...boardSnap.data() };
    if (!userHasBoardAccess(boardData, userId, userEmail, allowedBoardIds)) {
      res.status(403).json({ message: 'Board not accessible' });
      return;
    }

    // Find all lists for the given boardId
    const listsSnapshot = await db.collection('lists').where('boardId', '==', boardId).get();

    if (listsSnapshot.empty) {
      res.json([]);
      return;
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
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  const userEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email : null;
  const allowedBoardIds = getAllowedBoardIdsFromRequest(authedReq);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const { boardId } = req.params;
    const boardSnap = await db.collection('boards').doc(boardId).get();
    if (!boardSnap.exists) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }
    const boardData = { boardId, ...boardSnap.data() };
    if (!userHasBoardAccess(boardData, userId, userEmail, allowedBoardIds)) {
      res.status(403).json({ message: 'Board not accessible' });
      return;
    }

    const listsRef = db.collection('lists').where('boardId', '==', boardId);
    const snapshot = await listsRef.orderBy('position').get();
    const lists = snapshot.docs.map(doc => ({ listId: doc.id, ...doc.data() }));
    console.log(`[API] /api/boards/${boardId}/lists -> ${lists.length} registros visibles para ${userId}`);
    res.json(lists);
  } catch (error) {
    console.error("Error fetching lists:", error);
    res.status(500).json({ message: "Error fetching lists" });
  }
});

app.post('/api/boards/:boardId/lists', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  const userEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email : null;
  const allowedBoardIds = getAllowedBoardIdsFromRequest(authedReq);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }

  try {
    const { boardId } = req.params;
    const boardSnap = await db.collection('boards').doc(boardId).get();
    if (!boardSnap.exists) {
      res.status(404).json({ message: 'Board not found' });
      return;
    }
    const boardData = { boardId, ...boardSnap.data() };
    if (!userHasBoardAccess(boardData, userId, userEmail, allowedBoardIds)) {
      res.status(403).json({ message: 'Board not accessible' });
      return;
    }

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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
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

    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
    const endTimestamp = admin.firestore.Timestamp.fromDate(endDate);
    const snapshot = await db
      .collection('cards')
      .where('dueDate', '>=', startTimestamp)
      .where('dueDate', '<', endTimestamp)
      .get();

    let cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const filterUserId = (typeof userId === 'string' && userId.trim()) || getUserIdFromRequest(authedReq);
    if (filterUserId) {
      cards = cards.filter((c: any) => c.assignedToUserId === filterUserId);
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
        const enrichedPayload = {
          event: 'card_created',
          card: {
            ...newCard,
            userId: getUserIdFromRequest(authedReq), // Enriched: User ID
          },
          title: newCard.title, // Enriched: Explicit title
          description: newCard.description, // Enriched: Explicit description
          origin: 'user', // Enriched: Origin
        };
        await axios.post(webhook.url, enrichedPayload);
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
    // Loop Prevention: Check X-Source header from n8n
    const sourceHeader = req.headers['x-source'];
    const isN8n = typeof sourceHeader === 'string' && sourceHeader.toLowerCase() === 'n8n';

    if (!isN8n && oldCardData && oldCardData.listId !== updatedFields.listId) {
      const webhooksSnapshot = await db.collection('webhooks').where('triggerEvent', '==', 'card_moved').get();
      webhooksSnapshot.docs.forEach(async (doc) => {
        const webhook = doc.data();
        try {
          await axios.post(webhook.url, {
            event: 'card_moved',
            cardId,
            oldListId: oldCardData.listId,
            newListId: updatedFields.listId,
            card: { id: cardId, ...updatedFields },
            origin: 'user' // Explicit origin
          });
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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

// AI Triage Endpoint: Returns the next recommended task
app.get('/api/focus/next', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // Fetch meaningful cards (not done, not archived)
    // Since Firestore filtering is limited, we might need to fetch a bit more or rely on client-side logic? 
    // Ideally we query by status. But our schema uses 'completed' boolean.

    // Strategy: Query active cards for this user (assignedTo)
    const snapshot = await db.collection('cards')
      .where('assignedToUserId', '==', userId)
      .where('completed', '==', false)
      .where('archived', '==', false)
      .get();

    const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    if (cards.length === 0) {
      return res.json({ message: 'No tasks available', task: null });
    }

    // Scoring Logic
    // High Priority = 3, Medium = 2, Low = 1
    // Due Date passed or today = Bonus
    // CreatedAt (Oldest) = Tie breaker

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };

    const scored = cards.map(c => {
      let score = priorityScore[c.priority || 'medium'] || 1;

      // Due Date Bonus
      if (c.dueDate) {
        const due = toDate(c.dueDate); // helper: convert Timestamp/string to Date
        if (due < now) score += 5; // Overdue is urgent
        else if (due >= startOfDay && due < new Date(startOfDay.getTime() + 86400000)) score += 3; // Due today
      }

      // Oldest bonus (slightly) - to prevent starvation
      // We won't add specific score but rely on sort order
      return { card: c, score, createdAt: toDate(c.createdAt || now) };
    });

    // Sort based on score desc, then createdAt asc
    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const nextTask = scored[0].card;

    // Simplify response for AI context
    res.json({
      task: {
        id: nextTask.id,
        title: nextTask.title,
        description: nextTask.description,
        priority: nextTask.priority,
        listId: nextTask.listId,
        dueDate: nextTask.dueDate
      },
      reason: `Score: ${scored[0].score}` // Explainability
    });

  } catch (error) {
    console.error('Error in focus triage:', error);
    res.status(500).json({ message: 'Error calculating next focus' });
  }
});

// Helper for dates if not exists
const toDate = (val: any): Date => {
  if (!val) return new Date();
  if (val.toDate) return val.toDate(); // Firestore Timestamp
  return new Date(val);
};

app.patch('/api/timer-sessions/:sessionId', async (req, res) => {
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
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
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  const userEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email : null;
  const allowedBoardIds = getAllowedBoardIdsFromRequest(authedReq);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  if (isClientUser(authedReq)) {
    res.status(403).json({ message: 'Operation not permitted for client users' });
    return;
  }
  try {
    const { boardId } = req.params;
    const boardRef = db.collection('boards').doc(boardId);
    const boardSnap = await boardRef.get();
    if (!boardSnap.exists) return res.status(404).json({ message: 'Board not found' });
    const board = { boardId: boardSnap.id, ...boardSnap.data() };
    if (!userHasBoardAccess(board, userId, userEmail, allowedBoardIds)) {
      res.status(403).json({ message: 'Board not accessible' });
      return;
    }

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
      const snap = await db.collection('comments').where('cardId', 'in', cardIds.slice(0, 10)).get().catch(() => null);
      if (snap) comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Note: for >10 cardIds habría que paginar; MVP incluye comentarios del primer batch.
    }

    res.json({ board, lists, cards, comments, exportedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Error exporting board:', error);
    res.status(500).json({ message: 'Error exporting board' });
  }
});

// Import board from JSON (expects shape returned by export)
app.post('/api/boards/import', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  if (!ensureNonClientUser(authedReq, res)) {
    return;
  }
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const ownerEmail = typeof authedReq.user?.email === 'string' ? authedReq.user.email.trim().toLowerCase() : null;

  try {
    const payload = req.body || {};
    const srcBoard = payload.board;
    const srcLists = Array.isArray(payload.lists) ? payload.lists : [];
    const srcCards = Array.isArray(payload.cards) ? payload.cards : [];
    if (!srcBoard || !srcBoard.name) {
      return res.status(400).json({ message: 'Invalid payload: board is required' });
    }

    const incomingMembers =
      (srcBoard.memberIds ??
        srcBoard.members ??
        srcBoard.sharedWithUserIds ??
        srcBoard.participantIds ??
        srcBoard.userIds ??
        srcBoard.users) ?? [];

    // 1) Create new board
    const newBoardData = {
      name: `${srcBoard.name} (imported)`,
      description: srcBoard.description || '',
      ownerId: userId,
      memberIds: sanitizeMemberIds(incomingMembers, userId),
      visibility: srcBoard.visibility === 'public' ? 'public' : 'private',
      priority: sanitizePriority((srcBoard as any)?.priority, 'medium'),
      ...(ownerEmail ? { ownerEmail } : {}),
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

// --- Direct Gemini Strategy Integration (Esencial Flow v4.0) ---
const geminiAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // Initialize Gemini SDK

app.post('/api/gemini-task', async (req, res) => {
  const authedReq = req as AuthedRequest;
  const userId = getUserIdFromRequest(authedReq);
  if (!ensureNonClientUser(authedReq, res)) return;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { input_text } = req.body;
    if (!input_text || typeof input_text !== 'string') {
      return res.status(400).json({ message: 'input_text is required' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vqvfdqtzrnhsfeafwrua.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxdmZkcXR6cm5oc2ZlYWZ3cnVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3Mzc2MjAsImV4cCI6MjA4NjMxMzYyMH0.G_8Yw6GGhik9qvgh36dnjDTTrG5iy9Tei5_uA9Vb3JQ';
    const supabaseCli = createClient(supabaseUrl, supabaseKey);

    // 1. Convert input to vector (RAG) using text-embedding model
    let strategyContext = "";
    try {
      const embeddingRes = await geminiAi.models.embedContent({
        model: 'text-embedding-004',
        contents: input_text,
      });
      const embedding = embeddingRes.embeddings?.[0]?.values;

      if (embedding) {
        // Query Supabase strategy vectors
        const { data: strategies, error: rpcError } = await supabaseCli.rpc('match_strategy_vectors', {
          query_embedding: embedding,
          match_threshold: 0.7,
          match_count: 3
        });

        if (!rpcError && strategies && strategies.length > 0) {
          strategyContext = `\nREGLAS ESTRATÉGICAS APLICABLES V4.0:\n` + strategies.map((s: any) => `- ${s.content}`).join('\n');
        }
      }
    } catch (embErr) {
      console.warn("Could not retrieve strategy embeddings, proceeding with default behavior.", embErr);
    }

    // 2. Base System Instruction + Dynamic Strategies
    const systemInstruction = `
Eres un asistente experto en priorización radical. Analiza la petición del usuario y extrae la siguiente información en formato JSON puro.
Extrae estos 4 valores del 1 al 100 evaluando el texto dado el contexto de un CEO:
- impacto_financiero  (1-100)
- apalancamiento (1-100)
- urgencia (1-100)
- impacto_vital (1-100)

También define:
- project: si notas que pertenece a PRJ-VITAL, PRJ-MIGA, PRJ-ESENCIAL, PRJ-KUCHEN. Sino, usa "PRJ-NONE"
- title: un título conciso y procesable de la tarea.
- estimated_time: en minutos (default 25).
${strategyContext}
    `;

    // 3. Call Gemini
    const geminiResponse = await geminiAi.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: input_text,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      }
    });

    const outputText = geminiResponse.text || "{}";
    const parsedData = JSON.parse(outputText);

    // 3. Logic: Score Calculation
    const pF = parsedData.impacto_financiero || 0;
    const pA = parsedData.apalancamiento || 0;
    const pU = parsedData.urgencia || 0;
    const pV = parsedData.impacto_vital || 0;
    const baseScore = (pF * 0.35) + (pA * 0.30) + (pU * 0.15) + (pV * 0.20);

    // Project Multipliers
    const multipliers: Record<string, number> = {
      'PRJ-VITAL': 2.0,
      'PRJ-MIGA': 1.5,
      'PRJ-ESENCIAL': 1.2,
      'PRJ-KUCHEN': 1.0
    };
    const project = parsedData.project || 'PRJ-NONE';
    const finalScore = Math.min(Math.round(baseScore * (multipliers[project] || 1.0)), 100);

    // 4. Logic: Hard Block de Sueño
    const now = new Date();
    const currentHour = now.getHours(); // Local server time, can adjust to timezone if needed
    const isSleepBlock = currentHour >= 21 || currentHour < 5;

    let dueDate = admin.firestore.FieldValue.serverTimestamp() as any;
    if (isSleepBlock) {
      // Forzar para mañana a las 06:00
      const tomorrow = new Date(now);
      if (currentHour >= 21) {
        tomorrow.setDate(tomorrow.getDate() + 1);
      }
      tomorrow.setHours(6, 0, 0, 0);
      dueDate = admin.firestore.Timestamp.fromDate(tomorrow);
    }

    // 5. Build Description and Save to Supabase via existing logic or Firestore to sync to Supabase
    // Note: Since cards are currently in Supabase via edge frontend but this backend writes to Firestore?
    // According to prior code, the Node backend writes to FIREBASE Firestore for cards.
    // It seems there's a dual write or Supabase is only used loosely.
    // Given the prompt "Usa Supabase para almacenar...", if cards table is in Supabase we should write to Postgres!
    // But this backend currently uses admin.firestore(). We will format the description properly:

    const formattedDescription = `[AI Generated]\nProject: ${project}\nScore calculado: ${finalScore}\n(Fin: ${pF}, Apal: ${pA}, Urg: ${pU}, Vit: ${pV})\n\nOriginal: ${input_text}`;

    // 6. Save directly to Supabase since UI is reading from public.cards
    const newCardData = {
      title: parsedData.title || 'Nueva Tarea',
      description: formattedDescription,
      list_id: 'inbox', // Fallback to inbox queue
      priority: finalScore >= 90 ? 'high' : finalScore >= 60 ? 'medium' : 'low',
      due_date: isSleepBlock ? (dueDate.toDate ? dueDate.toDate().toISOString() : dueDate) : null,
      assigned_to_user_id: userId,
      estimated_time: parsedData.estimated_time || 25,
      actual_time: 0,
    };

    const { data: savedCard, error: supaErr } = await supabaseCli
      .from('cards')
      .insert(newCardData)
      .select()
      .single();

    if (supaErr) {
      console.error("Error saving to Supabase:", supaErr);
      return res.status(500).json({ error: "Failed to save card to Supabase", details: supaErr.message });
    }

    res.json({
      message: "Card created successfully",
      score: finalScore,
      sleep_blocked: isSleepBlock,
      card: savedCard
    });

  } catch (err: any) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: "Gemini Integration Failed", details: err.message });
  }
});
