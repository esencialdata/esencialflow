"use strict";
// backend/src/data.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.users = exports.timerSessions = exports.cards = exports.lists = exports.boards = void 0;
// --- Datos Iniciales ---
const initialBoardId = "board-1";
const initialListId1 = "list-1";
const initialListId2 = "list-2";
exports.boards = [
    {
        boardId: initialBoardId,
        name: "Tablero de Prueba",
        description: "Un tablero para desarrollo y pruebas",
        ownerId: "user-1",
        visibility: "public",
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date(),
    }
];
exports.lists = [
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
exports.cards = [
    {
        id: "card-1",
        title: "Conectar Frontend con Backend",
        description: "Implementar la llamada a la API para obtener los datos del tablero.",
        listId: initialListId1,
        priority: 'high',
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
        priority: 'medium',
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
        priority: 'low',
        dueDate: new Date(new Date().setDate(new Date().getDate() - 1)),
        assignedToUserId: "user-2",
        estimatedTime: 90,
        actualTime: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
];
exports.timerSessions = [];
exports.users = [
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
