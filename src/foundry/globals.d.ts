/**
 * Minimal ambient typings for the Foundry VTT 14.367 APIs Loreframe uses.
 *
 * Community typings do not cover v14, so this file is the single typed boundary to Foundry.
 * Every declaration here was checked against D:/Foundry/.../resources/app (build 367).
 * Keep it narrow: add only what the module actually calls.
 */
import type { Node as PMNode } from "prosemirror-model";
import type * as PMState from "prosemirror-state";
import type { PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

declare global {
  /* ---------------------------------- ProseMirror ---------------------------------- */

  type ProseMirrorCommand = (
    state: PMState.EditorState,
    dispatch: ((tr: PMState.Transaction) => void) | undefined,
    view: EditorView,
  ) => boolean;

  /** common/prosemirror/_types.mjs ProseMirrorMenuItem & _ProseMirrorDropDownEntry */
  interface ProseMirrorDropDownEntry {
    action: string;
    title: string;
    class?: string;
    style?: string;
    icon?: string;
    group?: number;
    priority?: number;
    cmd?: ProseMirrorCommand;
    active?: boolean;
    children?: ProseMirrorDropDownEntry[];
  }

  /** common/prosemirror/_types.mjs ProseMirrorDropDownConfig (+ weight/menu used by core menus) */
  interface ProseMirrorDropDownConfig {
    title: string;
    cssClass: string;
    icon?: string;
    weight?: number;
    entries: ProseMirrorDropDownEntry[];
  }

  /** common/prosemirror/menu.mjs ProseMirrorMenu — only the members Loreframe reads. */
  interface ProseMirrorMenuLike {
    view: EditorView;
  }

  const ProseMirror: {
    dom: { parseString(html: string): PMNode; serializeString(doc: PMNode): string };
    state: typeof PMState;
    plugins: { chat: { ChatInputPlugin: { readonly key: PluginKey } } };
  };

  /* ------------------------------------ Hooks ------------------------------------ */

  const Hooks: {
    on(hook: string, fn: (...args: never[]) => unknown): number;
    once(hook: string, fn: (...args: never[]) => unknown): number;
    callAll(hook: string, ...args: unknown[]): boolean;
  };

  /* ------------------------------------ game ------------------------------------ */

  interface SettingRegistration {
    name?: string;
    hint?: string;
    scope: "world" | "client" | "user";
    config: boolean;
    type: unknown;
    default: unknown;
    requiresReload?: boolean;
    onChange?: (value: never) => void;
  }

  const game: {
    settings: {
      register(namespace: string, key: string, data: SettingRegistration): void;
      get(namespace: string, key: string): unknown;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
    };
    modules: {
      get(id: string): { id: string; active: boolean; version: string; api?: unknown } | undefined;
    };
    system: { id: string };
    user: { name: string; isGM: boolean };
    /** client/helpers/interaction/tooltip-manager.mjs */
    tooltip: { element: HTMLElement | null; deactivate(): void };
    i18n: {
      localize(key: string): string;
      format(key: string, data: Record<string, string>): string;
    };
  };

  /** The dnd5e system's global namespace, when that system is active. */
  var dnd5e: { utils?: { formatCR?(value: number): string } } | undefined;

  const ui: {
    notifications: {
      error(message: string, options?: { localize?: boolean }): unknown;
      warn(message: string, options?: { localize?: boolean }): unknown;
      info(message: string, options?: { localize?: boolean; format?: Record<string, string> }): unknown;
    };
  };

  /* ---------------------------------- foundry.* ---------------------------------- */

  interface ApplicationV2Options {
    id?: string;
    classes?: string[];
    tag?: string;
    window?: {
      title?: string;
      icon?: string;
      resizable?: boolean;
      minimizable?: boolean;
      contentClasses?: string[];
    };
    position?: { width?: number | "auto"; height?: number | "auto"; top?: number; left?: number };
    actions?: Record<
      string,
      (this: ApplicationV2Instance, event: PointerEvent, target: HTMLElement) => unknown
    >;
    form?: {
      handler?: (
        this: ApplicationV2Instance,
        event: Event,
        form: HTMLFormElement,
        formData: { object: Record<string, unknown> },
      ) => unknown;
      closeOnSubmit?: boolean;
      submitOnChange?: boolean;
    };
  }

  interface ApplicationV2RenderOptions {
    force?: boolean;
    /** HandlebarsApplicationMixin: re-render only these parts. */
    parts?: string[];
    position?: { left?: number; top?: number; width?: number; height?: number };
  }

  interface ApplicationV2Instance {
    readonly id: string;
    readonly element: HTMLElement;
    readonly rendered: boolean;
    render(options?: ApplicationV2RenderOptions | boolean): Promise<this>;
    close(options?: object): Promise<this>;
    bringToFront(): void;
    _prepareContext(options: ApplicationV2RenderOptions): Promise<object>;
    /** HandlebarsApplicationMixin: called after each part is (re-)rendered. */
    _attachPartListeners(partId: string, htmlElement: HTMLElement, options: ApplicationV2RenderOptions): void;
  }

  type HandlebarsParts = Record<
    string,
    {
      template: string;
      scrollable?: string[];
      root?: boolean;
      /** Partials to preload. */ templates?: string[];
    }
  >;

  interface ApplicationV2Class {
    new (options?: ApplicationV2Options): ApplicationV2Instance;
    DEFAULT_OPTIONS: ApplicationV2Options;
  }

  const foundry: {
    utils: {
      randomID(length?: number): string;
      /** client/utils/helpers.mjs */
      fromUuid(
        uuid: string,
      ): Promise<{ name?: string; testUserPermission?(user: unknown, level: string): boolean } | null>;
      saveDataToFile(data: string, type: string, filename: string): void;
      readTextFromFile(file: File): Promise<string>;
    };
    applications: {
      ux: {
        /** client/applications/ux/text-editor.mjs */
        TextEditor: {
          implementation: {
            getDragEventData(event: DragEvent): { type?: unknown; uuid?: unknown };
            getContentLink(
              data: { type: string; uuid: string },
              options?: { relativeTo?: unknown; label?: string },
            ): Promise<string | null>;
          };
        };
        /** client/applications/ux/form-data-extended.mjs */
        FormDataExtended: new (form: HTMLFormElement) => { object: Record<string, unknown> };
      };
      apps: {
        /** client/applications/apps/file-picker.mjs */
        FilePicker: {
          implementation: new (options: {
            type?: string;
            current?: string;
            callback?: (path: string) => void;
          }) => { browse(): Promise<unknown> };
        };
      };
      api: {
        ApplicationV2: ApplicationV2Class;
        /** client/applications/api/dialog.mjs — resolves true (yes), false (no, the default) or null (dismissed). */
        DialogV2: {
          wait(config: {
            window?: { title?: string; icon?: string };
            classes?: string[];
            content?: string;
            modal?: boolean;
            buttons: {
              action: string;
              label?: string;
              icon?: string;
              default?: boolean;
              callback?: (event: Event, button: HTMLButtonElement) => unknown;
            }[];
          }): Promise<unknown>;
          confirm(config: {
            window?: { title?: string; icon?: string };
            content?: string;
            modal?: boolean;
            yes?: { label?: string; icon?: string };
            no?: { label?: string; icon?: string };
          }): Promise<boolean | null>;
        };
        HandlebarsApplicationMixin<T extends ApplicationV2Class>(base: T): T & { PARTS: HandlebarsParts };
      };
    };
  };
}

export {};
