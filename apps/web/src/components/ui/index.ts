export * from "./avatar";
export * from "./button";
export * from "./card";
export * from "./child-switcher";
export * from "./chip";
export * from "./empty-state";
export * from "./form-field";
export * from "./icons";
export * from "./logo";
export * from "./media-tile";
export * from "./notice";
export * from "./progress-bar";
export * from "./spinner";

// Modules « use client » : exports nommés, plus sûrs qu'un `export *` à travers la frontière.
export { Dialog, type DialogProps } from "./dialog";
export {
  FilterPill,
  FilterPillLink,
  FilterPills,
  type FilterPillLinkProps,
  type FilterPillProps,
  type FilterPillsProps,
} from "./filter-pills";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./segmented-control";
export {
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from "./tabs";
export { Toast, Toaster, dismissToast, toast, type ToastOptions, type ToastProps } from "./toast";
