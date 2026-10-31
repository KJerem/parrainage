export * from "./auth-split-layout";
export * from "./app-sidebar-shell";
export * from "./kid-shell";
export * from "./nav-config";
export * from "./page-grids";
export * from "./parrain-shell";
export * from "./relais-mobile";
export * from "./skip-link";

// Modules « use client » : exports nommés, comme dans components/ui.
export { AppTopBar, type AppTopBarProps } from "./app-top-bar";
export { Drawer, type DrawerProps } from "./drawer";
export { MenuButton, type MenuButtonProps } from "./menu-button";
export {
  ParrainNav,
  SidebarNav,
  useActiveKey,
  type ParrainNavProps,
  type SidebarNavProps,
} from "./nav-links";
export {
  RelaisBottomNav,
  type RelaisBottomNavKey,
  type RelaisBottomNavProps,
} from "./relais-bottom-nav";
