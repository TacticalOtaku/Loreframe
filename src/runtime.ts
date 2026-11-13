import { MODULE_ID, SETTINGS } from "./constants";
import { newInstanceId } from "./core/instance-id";
import { createCore, type LoreframeCore } from "./core/loreframe-core";
import { getSetting } from "./core/settings";
import { TemplateCatalog, type PreferenceKey } from "./core/template-catalog";
import { createBlockLifecycle, type BlockLifecycle } from "./editor/block-document";
import { EditorTracker } from "./editor/editor-tracker";
import { createTemplateInserter, type TemplateInserter } from "./editor/insert";
import {
  createDocumentDropHandler,
  type DocumentDropHandler,
  type DropChoice,
} from "./integrations/document-drop-flow";
import { IntegrationManager } from "./integrations/integration-manager";
import { escapeHtml } from "./utils/html";

/** Foundry-bound services shared by hooks, the editor menu, the library window and the API. */
export interface LoreframeRuntime {
  readonly core: LoreframeCore;
  readonly catalog: TemplateCatalog;
  readonly tracker: EditorTracker;
  readonly integrations: IntegrationManager;
  readonly inserter: TemplateInserter;
  readonly blocks: BlockLifecycle;
  readonly dropHandler: DocumentDropHandler;
}

const DROP_CHOICES: { value: DropChoice; label: string }[] = [
  { value: "link", label: "LOREFRAME.Integration.InsertAs.Link" },
  { value: "npc-card", label: "LOREFRAME.Template.NpcCard.Name" },
  { value: "npc-dossier", label: "LOREFRAME.Template.NpcDossier.Name" },
];

export function createRuntime(): LoreframeRuntime {
  const localize = (key: string) => game.i18n.localize(key);
  const format = (key: string, data: Record<string, string>) => game.i18n.format(key, data);

  const core = createCore({ localize, newInstanceId });
  const preferenceSetting = (key: PreferenceKey) =>
    key === "favorites" ? SETTINGS.favorites : SETTINGS.recent;

  const catalog = new TemplateCatalog({
    templates: core.templates,
    presets: core.presets,
    renderer: core.renderer,
    systemId: () => game.system.id,
    localize,
    newId: newInstanceId,
    formatCopyName: (name) => format("LOREFRAME.UserTemplates.CopyName", { name }),
    storage: {
      readUserTemplates: () => getSetting(SETTINGS.userTemplates),
      writeUserTemplates: (list) => game.settings.set(MODULE_ID, SETTINGS.userTemplates, list),
      readPreference: (key) => getSetting(preferenceSetting(key)),
      writePreference: (key, value) => game.settings.set(MODULE_ID, preferenceSetting(key), value),
    },
  });

  const tracker = new EditorTracker();
  const integrations = new IntegrationManager({
    systemId: () => game.system.id,
    enabled: () => getSetting(SETTINGS.enableIntegrations),
  });

  const inserter = createTemplateInserter({
    catalog,
    renderNew: core.renderNew,
    parseHtml: (html) => ProseMirror.dom.parseString(html),
    pm: ProseMirror.state,
    notifyError: (key) => ui.notifications.error(key, { localize: true }),
  });

  const blocks = createBlockLifecycle({
    templates: core.templates,
    renderer: core.renderer,
    pm: ProseMirror.state,
    parseHtml: (html) => ProseMirror.dom.parseString(html),
    newInstanceId,
    ui: {
      localize,
      notifyWarn: (key) => ui.notifications.warn(key, { localize: true }),
      notifyError: (key) => ui.notifications.error(key, { localize: true }),
      notifyInfo: (key, data) => ui.notifications.info(key, { format: data }),
      confirm: async ({ titleKey, contentKey, contentFormat, confirmKey, icon }) => {
        const text = contentFormat ? format(contentKey, contentFormat) : localize(contentKey);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: localize(titleKey), icon },
          content: `<p>${text}</p>`,
          modal: true,
          yes: { label: localize(confirmKey), icon },
        });
        return confirmed === true;
      },
    },
  });

  const dropHandler = createDocumentDropHandler({
    integrations,
    insertBlock: (view, templateId, options) => inserter.insert(view, templateId, options),
    ui: {
      resolveDocument: (uuid) => foundry.utils.fromUuid(uuid),
      hasObserverPermission: (doc) =>
        (doc as { testUserPermission?(user: unknown, permission: "OBSERVER"): boolean }).testUserPermission?.(
          game.user,
          "OBSERVER",
        ) === true,
      chooseInsertion: (name, defaultChoice) => promptDropChoice(name, defaultChoice, localize, format),
      buildContentLink: async ({ type, uuid, relativeTo, label }) =>
        foundry.applications.ux.TextEditor.implementation.getContentLink(
          { type, uuid },
          { ...(relativeTo ? { relativeTo } : {}), ...(label ? { label } : {}) },
        ),
      localize,
      format,
      notifyError: (key) => ui.notifications.error(key, { localize: true }),
    },
  });

  return { core, catalog, tracker, integrations, inserter, blocks, dropHandler };
}

async function promptDropChoice(
  name: string,
  defaultChoice: DropChoice,
  localize: (key: string) => string,
  format: (key: string, data: Record<string, string>) => string,
): Promise<DropChoice | null> {
  const options = DROP_CHOICES.map(
    ({ value, label }) => `
      <label class="loreframe-insert-as__option">
        <input type="radio" name="loreframeInsertAs" value="${value}" ${value === defaultChoice ? "checked" : ""}>
        <span>${escapeHtml(localize(label))}</span>
      </label>`,
  ).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: localize("LOREFRAME.Integration.InsertAs.Title"),
      icon: "fa-solid fa-user-plus",
    },
    classes: ["loreframe", "loreframe-insert-as"],
    content: `
      <p class="loreframe-insert-as__hint">${escapeHtml(format("LOREFRAME.Integration.InsertAs.Hint", { name }))}</p>
      <fieldset class="loreframe-insert-as__choices">
        <legend>${escapeHtml(localize("LOREFRAME.Integration.InsertAs.Label"))}</legend>
        ${options}
      </fieldset>`,
    buttons: [
      {
        action: "insert",
        label: localize("LOREFRAME.Integration.InsertAs.Insert"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (_event, button) => {
          const checked = button.form?.querySelector<HTMLInputElement>(
            "input[name=loreframeInsertAs]:checked",
          );
          return checked?.value ?? "link";
        },
      },
      { action: "cancel", label: localize("COMMON.Cancel"), icon: "fa-solid fa-xmark" },
    ],
  });
  if (result === "link" || result === "npc-card" || result === "npc-dossier") return result;
  return null;
}
