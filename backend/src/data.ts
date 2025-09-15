// backend/src/data.ts

export interface Board {
  boardId: string;
  name: string;
  description?: string;
  ownerId: string;
  visibility: "public" | "private";
  createdAt: Date;
  updatedAt: Date;
}

export interface List {
  listId: string;
  name: string;
  boardId: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  listId: string;
  dueDate?: Date;
  assignedToUserId?: string;
  estimatedTime?: number;
  actualTime?: number;
  createdAt: Date;
  updatedAt: Date;
  checklist?: { text: string; completed: boolean }[];
}

export interface TimerSession {
  sessionId: string;
  cardId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
  type: "focus" | "break";
}

export interface User {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

// --- Datos Iniciales ---

const initialBoardId = "board-1";
const initialListId1 = "list-1";
const initialListId2 = "list-2";

export const boards: Board[] = [
  {
    boardId: initialBoardId,
    name: "Tablero de Prueba",
    description: "Un tablero para desarrollo y pruebas",
    ownerId: "user-1",
    visibility: "public",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
];

export const lists: List[] = [
  {
    listId: initialListId1,
    name: "Tareas por Hacer",
    boardId: initialBoardId,
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    listId: initialListId2,
    name: "En Progreso",
    boardId: initialBoardId,
    position: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
];

export const cards: Card[] = [
  {
    id: "card-1",
    title: "Conectar Frontend con Backend",
    description: "Implementar la llamada a la API para obtener los datos del tablero.",
    listId: initialListId1,
    dueDate: new Date(new Date().setDate(new Date().getDate() + 1)),
    assignedToUserId: "user-1",
    estimatedTime: 60,
    actualTime: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    checklist: [
      { text: "Definir endpoints", completed: true },
      { text: "Implementar lógica del servidor", completed: false },
    ],
  },
  {
    id: "card-2",
    title: "Crear datos de prueba",
    description: "Añadir datos iniciales al backend para facilitar el desarrollo.",
    listId: initialListId1,
    dueDate: new Date(),
    assignedToUserId: "user-1",
    estimatedTime: 30,
    actualTime: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "card-3",
    title: "Revisar la funcionalidad de Drag and Drop",
    description: "Asegurarse de que las tarjetas se puedan mover entre listas.",
    listId: initialListId2,
    dueDate: new Date(new Date().setDate(new Date().getDate() - 1)),
    assignedToUserId: "user-2",
    estimatedTime: 90,
    actualTime: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
];

export const timerSessions: TimerSession[] = [];

export const users: User[] = [
  {
    userId: "user-1",
    name: "Ana García",
    email: "ana.garcia@example.com",
  },
  {
    userId: "user-2",
    name: "David López",
    email: "david.lopez@example.com",
  }
];