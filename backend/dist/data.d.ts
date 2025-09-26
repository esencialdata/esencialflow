export interface Board {
    boardId: string;
    name: string;
    description?: string;
    ownerId: string;
    visibility: "public" | "private";
    priority: 'low' | 'medium' | 'high';
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
    priority: 'low' | 'medium' | 'high';
    dueDate?: Date;
    assignedToUserId?: string;
    estimatedTime?: number;
    actualTime?: number;
    createdAt: Date;
    updatedAt: Date;
    checklist?: {
        text: string;
        completed: boolean;
    }[];
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
export declare const boards: Board[];
export declare const lists: List[];
export declare const cards: Card[];
export declare const timerSessions: TimerSession[];
export declare const users: User[];
