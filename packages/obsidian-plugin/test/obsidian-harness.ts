/**
 * Documented Obsidian plugin APIs used by this slice, implemented for tests.
 * This is not a substitute for installing the plugin in Obsidian Desktop; it
 * exercises the same registerMarkdownCodeBlockProcessor / MarkdownRenderChild
 * contract against jsdom so the renderer and lifecycle are not mocked away.
 */

export class MarkdownRenderChild {
  constructor(public containerEl: HTMLElement) {}
  onload(): void {}
  onunload(): void {}
}

export interface MarkdownPostProcessorContext {
  addChild(child: MarkdownRenderChild): void;
}

type Processor = (
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => void | Promise<void>;

export class App {}

export class PluginSettingTab {
  containerEl: HTMLElement;
  constructor(public app: App, public plugin: Plugin) {
    this.containerEl = document.createElement('div');
  }
  display(): void {}
}

type DropdownChange = (value: string) => void | Promise<void>;
type SliderChange = (value: number) => void | Promise<void>;

class SettingDropdown {
  private change: DropdownChange = () => {};
  addOption(_value: string, _label: string): this { return this; }
  setValue(_value: string): this { return this; }
  onChange(cb: DropdownChange): this { this.change = cb; return this; }
}

class SettingSlider {
  private change: SliderChange = () => {};
  setLimits(_min: number, _max: number, _step: number): this { return this; }
  setValue(_value: number): this { return this; }
  setDynamicTooltip(): this { return this; }
  onChange(cb: SliderChange): this { this.change = cb; return this; }
}

class SettingExtraButton {
  setIcon(_icon: string): this { return this; }
  setTooltip(_tooltip: string): this { return this; }
  onClick(_cb: () => void | Promise<void>): this { return this; }
}

export class Setting {
  constructor(public containerEl: HTMLElement) {}
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addDropdown(cb: (dropdown: SettingDropdown) => void): this {
    cb(new SettingDropdown());
    return this;
  }
  addSlider(cb: (slider: SettingSlider) => void): this {
    cb(new SettingSlider());
    return this;
  }
  addExtraButton(cb: (btn: SettingExtraButton) => void): this {
    cb(new SettingExtraButton());
    return this;
  }
}

export class Plugin {
  readonly processors = new Map<string, Processor>();
  readonly app = new App();
  private data: unknown = {};
  settingTabs: PluginSettingTab[] = [];

  registerMarkdownCodeBlockProcessor(language: string, handler: Processor): void {
    this.processors.set(language, handler);
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }

  async loadData(): Promise<unknown> {
    return this.data;
  }

  async saveData(data: unknown): Promise<void> {
    this.data = data;
  }
}

export interface MountedBlock {
  el: HTMLElement;
  child: MarkdownRenderChild;
}

export function extractNotationFences(markdown: string, language: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`^\`\`\`${language}[ \\t]*\\r?\\n([\\s\\S]*?)^\`\`\`[ \\t]*$`, 'gm');
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

/** @deprecated Prefer {@link extractNotationFences}. */
export function extractGoalsFences(markdown: string): string[] {
  return extractNotationFences(markdown, 'transitrix-goals');
}

export function mountPluginBlocks(
  plugin: Plugin,
  markdown: string,
  parent: HTMLElement,
  language = 'transitrix-goals',
): MountedBlock[] {
  const processor = plugin.processors.get(language);
  if (!processor) throw new Error(`${language} processor is not registered`);
  const mounted: MountedBlock[] = [];
  for (const source of extractNotationFences(markdown, language)) {
    const el = parent.ownerDocument.createElement('div');
    parent.appendChild(el);
    let child: MarkdownRenderChild | undefined;
    const ctx: MarkdownPostProcessorContext = {
      addChild(next) {
        child = next;
      },
    };
    void processor(source, el, ctx);
    if (!child) throw new Error('processor did not register a MarkdownRenderChild');
    child.onload();
    mounted.push({ el, child });
  }
  return mounted;
}

export function unloadBlocks(blocks: MountedBlock[]): void {
  for (const block of blocks) block.child.onunload();
}
