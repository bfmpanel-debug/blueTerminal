
export enum MessageType {
  SENT = 'sent',
  RECEIVED = 'received',
  STATUS = 'status',
  ERROR = 'error'
}

export interface TerminalMessage {
  id: string;
  timestamp: Date;
  type: MessageType;
  content: string;
}

export interface BleDeviceState {
  device: any | null;
  server: any | null;
  characteristic: any | null;
  connected: boolean;
  deviceName: string;
}
