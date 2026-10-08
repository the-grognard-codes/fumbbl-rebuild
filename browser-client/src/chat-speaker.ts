import type { ChatMessage } from './chat-protocol.ts';

/** Names use authoritative match roles; spectator ordinals arrive with the saved history. */
export function chatSpeaker(message: Pick<ChatMessage, 'role' | 'spectatorNumber'> | { role: 'system' }, homeName?: string, awayName?: string): string {
  if (message.role === 'system') return 'Match';
  if (message.role === 'spectator') return typeof message.spectatorNumber === 'number' ? `Spectator${message.spectatorNumber}` : 'Spectator';
  const home = homeName || 'Home', away = awayName || 'Away';
  const collision = home.toLowerCase() === away.toLowerCase();
  const name = message.role === 'home' ? home : away;
  return collision ? `${name} (${message.role === 'home' ? 'Home' : 'Away'})` : name;
}
