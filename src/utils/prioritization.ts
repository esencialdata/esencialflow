import { Card } from '../types/data';

export interface PrioritySignals {
  score: number;
  projectId: string | null;
  utilityDomain: NonNullable<Card['utilityDomain']> | null;
  priorityWeight: number;
  domainWeight: number;
  dueWeight: number;
  ageTime: number;
  rank: number;
  label: string;
  utilityLabel: string | null;
}

const PRIORITY_WEIGHT: Record<Card['priority'], number> = {
  high: 30,
  medium: 18,
  low: 8,
  backlog: 0,
};

const PROJECT_LABELS: Record<string, string> = {
  'PRJ-VITAL': 'vida/energía',
  'PRJ-MIGA': 'producto propio',
  'PRJ-ESENCIAL': 'flujo de caja',
  'PRJ-ES-KUCHEN': 'cliente',
  'PRJ-ES-QUINTA': 'cliente',
  'PRJ-ES-QUALISTER': 'cliente',
  'PRJ-ES-CHELITO': 'cliente',
  'PRJ-ESTUDIO': 'capacidad futura',
  'PRJ-CREAMOS': 'marca personal',
  'PRJ-NONE': 'sin proyecto',
};

const DOMAIN_LABELS: Record<NonNullable<Card['utilityDomain']>, string> = {
  money: 'dinero',
  client_delivery: 'cliente',
  own_product: 'producto',
  personal_growth: 'crecimiento',
  idi_creamos: 'IDI/Creamos',
  health_energy: 'salud/energía',
  admin: 'admin',
};

const DOMAIN_WEIGHT: Record<NonNullable<Card['utilityDomain']>, number> = {
  money: 12,
  client_delivery: 10,
  health_energy: 9,
  own_product: 8,
  idi_creamos: 7,
  personal_growth: 5,
  admin: 0,
};

export const extractScore = (card: Pick<Card, 'score' | 'description'>): number => {
  if (typeof card.score === 'number' && Number.isFinite(card.score)) return card.score;
  const match = card.description?.match(/Score\s+calculado:\s*([\d.]+)/i);
  return match ? Number(match[1]) : 0;
};

export const extractProjectId = (card: Pick<Card, 'projectId' | 'description'>): string | null => {
  if (card.projectId) return card.projectId;
  const match = card.description?.match(/(PRJ-[A-Z0-9-]+)/i);
  return match ? match[1].toUpperCase() : null;
};

export const inferUtilityDomain = (card: Pick<Card, 'utilityDomain' | 'projectId' | 'description'>): NonNullable<Card['utilityDomain']> | null => {
  if (card.utilityDomain) return card.utilityDomain;

  const domainMatch = card.description?.match(/Utility:\s*([a-z_]+)/i);
  const rawDomain = domainMatch?.[1] as NonNullable<Card['utilityDomain']> | undefined;
  if (rawDomain && rawDomain in DOMAIN_LABELS) return rawDomain;

  const projectId = extractProjectId(card);
  if (!projectId) return null;
  if (projectId === 'PRJ-VITAL') return 'health_energy';
  if (projectId === 'PRJ-CREAMOS') return 'idi_creamos';
  if (projectId === 'PRJ-ESTUDIO') return 'personal_growth';
  if (projectId === 'PRJ-MIGA') return 'own_product';
  if (projectId === 'PRJ-ESENCIAL') return 'money';
  if (projectId.startsWith('PRJ-ES-')) return 'client_delivery';
  return 'admin';
};

const dueWeightFor = (dueDate?: Date | string): number => {
  if (!dueDate) return 0;

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  const dueTime = due.getTime();

  if (dueTime < now.getTime()) return 20;
  if (dueTime >= todayStart && dueTime < tomorrowStart) return 14;
  if (dueTime < tomorrowStart + 24 * 60 * 60 * 1000) return 8;
  return 0;
};

export const getPrioritySignals = (card: Card): PrioritySignals => {
  const score = extractScore(card);
  const projectId = extractProjectId(card);
  const utilityDomain = inferUtilityDomain(card);
  const priorityWeight = PRIORITY_WEIGHT[card.priority] ?? PRIORITY_WEIGHT.medium;
  const domainWeight = utilityDomain ? DOMAIN_WEIGHT[utilityDomain] : 0;
  const dueWeight = dueWeightFor(card.dueDate);
  const ageTime = new Date(card.createdAt || 0).getTime() || 0;
  const rank = score + dueWeight + priorityWeight + domainWeight;
  const utilityLabel = utilityDomain ? DOMAIN_LABELS[utilityDomain] : null;
  const label = [
    score >= 90 ? 'P0' : score >= 75 ? 'P1' : score >= 50 ? 'P2' : 'Backlog',
    utilityLabel,
    projectId ? PROJECT_LABELS[projectId] || projectId : null,
  ].filter(Boolean).join(' · ');

  return { score, projectId, utilityDomain, priorityWeight, domainWeight, dueWeight, ageTime, rank, label, utilityLabel };
};

export const sortByLifeUtility = (cards: Card[]): Card[] => (
  [...cards].sort((a, b) => {
    const signalA = getPrioritySignals(a);
    const signalB = getPrioritySignals(b);

    if (signalA.rank !== signalB.rank) return signalB.rank - signalA.rank;
    if (signalA.score !== signalB.score) return signalB.score - signalA.score;
    return signalA.ageTime - signalB.ageTime;
  })
);
