import { MenuSection } from '../ui/state';

export interface PluginAppContext {
  windowId: string;
  setMenus: (menus: MenuSection[]) => void;
}

export interface PluginAppDefinition {
  id: string;
  title: string;
  dock?: boolean;
  render: (ctx: PluginAppContext) => JSX.Element;
}

export interface PluginDefinition {
  id: string;
  name: string;
  version: string;
  apps: PluginAppDefinition[];
}
