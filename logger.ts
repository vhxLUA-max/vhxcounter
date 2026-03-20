import { Server as SocketServer } from 'socket.io';

export type LogLevel    = 'info' | 'warn' | 'error' | 'success';
export type LogCategory = 'auth' | 'db' | 'network' | 'bot' | 'system' | 'security' | 'command';

export interface LogEntry {
  id:        string;
  timestamp: string;
  level:     LogLevel;
  category:  LogCategory;
  message:   string;
}

const buffer: LogEntry[] = [];
let   io: SocketServer | null = null;

export function initLogger(socketServer: SocketServer) {
  io = socketServer;
}

export function getBuffer() { return buffer.slice(); }

function emit(level: LogLevel, category: LogCategory, message: string) {
  const entry: LogEntry = {
    id:        crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
  };

  buffer.push(entry);
  if (buffer.length > 500) buffer.shift();

  const orig = level === 'error' ? console.error
             : level === 'warn'  ? console.warn
             : console.log;
  orig(`[${level.toUpperCase()}][${category}] ${message}`);

  io?.to('admin_stream').emit('system_log', entry);
}

export const logger = {
  info:    (category: LogCategory, message: string) => emit('info',    category, message),
  warn:    (category: LogCategory, message: string) => emit('warn',    category, message),
  error:   (category: LogCategory, message: string) => emit('error',   category, message),
  success: (category: LogCategory, message: string) => emit('success', category, message),
};
