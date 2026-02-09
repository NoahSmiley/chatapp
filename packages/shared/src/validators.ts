import {
  MAX_MESSAGE_LENGTH,
  MAX_SERVER_NAME_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "./constants.js";

export function validateUsername(username: string): string | null {
  if (username.length < MIN_USERNAME_LENGTH) {
    return `Username must be at least ${MIN_USERNAME_LENGTH} characters`;
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return `Username must be at most ${MAX_USERNAME_LENGTH} characters`;
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return "Username can only contain letters, numbers, underscores, and hyphens";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function validateServerName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Server name cannot be empty";
  if (trimmed.length > MAX_SERVER_NAME_LENGTH) {
    return `Server name must be at most ${MAX_SERVER_NAME_LENGTH} characters`;
  }
  return null;
}

export function validateChannelName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Channel name cannot be empty";
  if (trimmed.length > MAX_CHANNEL_NAME_LENGTH) {
    return `Channel name must be at most ${MAX_CHANNEL_NAME_LENGTH} characters`;
  }
  if (!/^[a-z0-9_-]+$/.test(trimmed)) {
    return "Channel name can only contain lowercase letters, numbers, underscores, and hyphens";
  }
  return null;
}

export function validateMessageContent(ciphertext: string): string | null {
  if (ciphertext.length === 0) return "Message cannot be empty";
  if (ciphertext.length > MAX_MESSAGE_LENGTH * 4) {
    return "Encrypted message exceeds maximum size";
  }
  return null;
}
