import type { PluginKey } from "prosemirror-state";

/**
 * Whether the plugins being configured belong to the chat message input.
 *
 * Foundry 14 gives every editor a placeholder `chatInput` plugin (client/applications/ux/prosemirror-editor.mjs
 * `buildDefaultPlugins`); only the chat log (client/applications/sidebar/tabs/chat.mjs) replaces it with a
 * ChatInputPlugin, whose spec carries `ChatInputPlugin.key`. The key, not the slot name, identifies chat.
 */
export function isChatEditor(plugins: Record<string, unknown>, chatInputKey: PluginKey): boolean {
  const slot = plugins.chatInput as { spec?: { key?: unknown } } | undefined;
  return slot?.spec?.key === chatInputKey;
}
