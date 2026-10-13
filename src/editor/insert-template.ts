import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import type { TemplateRegistry } from "../core/template-registry";
import { logger } from "../utils/logger";
import { insertBlockTransaction, type StateModule } from "./insert";

/** The parts of a ProseMirror EditorView an insertion needs. */
export interface InsertTarget {
  readonly editable: boolean;
  readonly state: EditorState;
  dispatch(tr: Transaction): void;
  focus(): void;
}

export interface InsertTemplateDeps {
  templates: Pick<TemplateRegistry, "get">;
  /** Render a template as a new instance. */
  renderNew(templateId: string, options?: { values?: Record<string, unknown>; preset?: string }): string;
  /** Parse HTML with the editor's schema (Foundry: `ProseMirror.dom.parseString`). */
  parseHtml(html: string): PMNode;
  stateModule: StateModule;
  recordUse(templateId: string): Promise<void> | void;
  /** Show a localized error to the user. */
  notifyError(key: string): void;
}

export interface InsertTemplateOptions {
  values?: Record<string, unknown>;
  preset?: string;
  /** Insert at this document position instead of the current selection (e.g. a drop point). */
  at?: number;
  /** Id remembered as recently used (a user template inserts its base but is remembered itself). */
  recordAs?: string;
}

/**
 * Insert a fresh instance of a template at the editor's selection (or `options.at`). Shared by the editor menu, the
 * library and document drops.
 */
export function insertTemplateIntoView(
  view: InsertTarget,
  templateId: string,
  deps: InsertTemplateDeps,
  options: InsertTemplateOptions = {},
): boolean {
  if (!view.editable) {
    logger.warn(`Cannot insert "${templateId}": the editor is read-only`);
    deps.notifyError("LOREFRAME.Error.NoEditor");
    return false;
  }
  try {
    const { values, preset, at } = options;
    const renderOptions = {
      ...(values === undefined ? {} : { values }),
      ...(preset === undefined ? {} : { preset }),
    };
    const block = deps.parseHtml(
      Object.keys(renderOptions).length
        ? deps.renderNew(templateId, renderOptions)
        : deps.renderNew(templateId),
    ).firstChild;
    if (!block) throw new Error(`Template "${templateId}" produced no content`);
    if (at !== undefined) {
      const { doc } = view.state;
      const $pos = doc.resolve(Math.max(0, Math.min(at, doc.content.size)));
      view.dispatch(view.state.tr.setSelection(deps.stateModule.Selection.near($pos)));
    }
    const focusField = deps.templates.get(templateId)?.focusField;
    view.dispatch(insertBlockTransaction(view.state, block, deps.stateModule, { focusField }));
    view.focus();
  } catch (error) {
    logger.error(`Inserting template "${templateId}" failed`, error);
    deps.notifyError("LOREFRAME.Error.InsertFailed");
    return false;
  }
  const used = options.recordAs ?? templateId;
  Promise.resolve(deps.recordUse(used)).catch((error: unknown) =>
    logger.error(`Could not remember recent use of "${used}"`, error),
  );
  return true;
}
