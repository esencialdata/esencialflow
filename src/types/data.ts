// src/types/data.ts

// Definiciones de interfaces para el modelo de datos de Esencial Flow

export interface User {
  userId: string; // Identificador único del usuario
  name: string;
  email: string;
  avatarUrl?: string; // URL de la imagen de perfil (opcional)
}

export interface Habit {
  id: string;
  name: string;
  description?: string;
  userId: string;
  archived?: boolean;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface HabitDailyStatus extends Habit {
  date: string;
  completed: boolean;
  completedAt?: Date | string | null;
}

export interface Board {
  boardId: string; // Identificador único del tablero
  name: string; // Nombre del tablero
  description?: string; // Descripción del tablero (opcional)
  ownerId: string; // ID del usuario creador/propietario
  visibility: "public" | "private"; // Visibilidad del tablero
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt: Date;
}

export interface List {
  listId: string; // Identificador único de la lista
  name: string; // Nombre de la lista
  boardId: string; // ID del tablero al que pertenece
  position: number; // Orden de la lista en el tablero
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  attachmentId: string;
  fileName: string;
  url: string;
  createdAt: Date | string;
  fileType: string;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  listId: string;
  priority: 'low' | 'medium' | 'high';
  position?: number; // Orden dentro de la lista
  dueDate?: Date | string;
  completed?: boolean;
  completedAt?: Date | string;
  archived?: boolean;
  archivedAt?: Date | string;
  assignedToUserId?: string;
  estimatedTime?: number; // en minutos
  actualTime?: number; // en minutos
  createdAt: Date | string;
  updatedAt: Date | string;
  checklist?: { text: string; completed: boolean }[];
  attachments?: Attachment[];
}

export interface TimerSession {
  sessionId: string; // Identificador único de la sesión de temporizador
  cardId: string; // ID de la tarjeta asociada
  userId: string; // ID del usuario que inició la sesión
  startTime: Date; // Hora de inicio de la sesión
  endTime?: Date; // Hora de finalización de la sesión (opcional, si la sesión está en curso)
  durationMinutes?: number; // Duración de la sesión en minutos (opcional, si la sesión está en curso)
  type: "focus" | "break"; // Tipo de sesión
  createdAt: Date;
}

export interface Comment {
  id: string;
  cardId: string;
  authorUserId: string;
  text: string;
  mentions?: string[]; // userIds mencionados
  createdAt: Date | string;
}

export interface AutomationRule {
  ruleId: string; // Identificador único de la regla de automatización
  boardId: string; // ID del tablero al que aplica la regla
  triggerEvent: string; // Evento que dispara la regla (ej. card_moved)
  triggerCondition?: string; // Condición adicional (ej. to_list_id) (opcional)
  actionType: string; // Tipo de acción (ej. move_card, assign_user)
  actionDetails?: string; // Detalles de la acción (ej. target_list_id, target_user_id) (opcional)
  isActive: boolean; // Indica si la regla está activa
  createdAt: Date;
  updatedAt: Date;
}

export interface Webhook {
  id: string;
  url: string;
  triggerEvent: string;
  createdAt: Date | string;
}
