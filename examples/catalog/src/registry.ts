import type { ComponentDemos, DemoGroup } from "./types";
import { StacksDemos } from "./demos/Stacks";
import { GroupDemos } from "./demos/Group";
import { SeparatorDemos, SpacerDemos, ScrollViewDemos, ShapesDemos, VisuallyHiddenDemos } from "./demos/Misc";
import { TextDemos } from "./demos/Text";
import { ButtonDemos } from "./demos/Button";
import { InputDemos } from "./demos/Input";
import { CheckboxDemos } from "./demos/Checkbox";
import { SwitchDemos } from "./demos/Switch";
import { RadioGroupDemos } from "./demos/RadioGroup";
import { SliderDemos } from "./demos/Slider";
import { SelectDemos } from "./demos/Select";
import { ToggleGroupDemos } from "./demos/ToggleGroup";
import { LabelDemos } from "./demos/Label";
import { FormDemos } from "./demos/Form";
import { DialogDemos } from "./demos/Dialog";
import { AlertDialogDemos } from "./demos/AlertDialog";
import { PopoverDemos } from "./demos/Popover";
import { SheetDemos } from "./demos/Sheet";
import { TooltipDemos } from "./demos/Tooltip";
import { ToastDemos } from "./demos/Toast";
import { CardDemos } from "./demos/Card";
import { AvatarDemos } from "./demos/Avatar";
import { ImageDemos } from "./demos/Image";
import { ListItemDemos } from "./demos/ListItem";
import { ProgressDemos } from "./demos/Progress";
import { SpinnerDemos } from "./demos/Spinner";
import { AccordionDemos } from "./demos/Accordion";
import { TabsDemos } from "./demos/Tabs";
import { SignInExample } from "./demos/examples/SignIn";
import { InputsExample } from "./demos/examples/Inputs";
import { CheckboxCardsExample } from "./demos/examples/CheckboxCards";
import { GroupedRadioExample } from "./demos/examples/GroupedRadio";
import { SettingsExample } from "./demos/examples/Settings";
import { WritePreviewExample } from "./demos/examples/WritePreview";
import { ChipsExample } from "./demos/examples/Chips";
import { ButtonGalleryExample } from "./demos/examples/ButtonGallery";
import { AvatarsExample } from "./demos/examples/Avatars";
import { UsersTableExample } from "./demos/examples/UsersTable";
import { TabBarExample } from "./demos/examples/TabBar";
import { SlidingPopoverExample } from "./demos/examples/SlidingPopover";
import { DatePickerExample } from "./demos/examples/DatePicker";
import { PricingExample } from "./demos/examples/Pricing";
import { DashboardExample } from "./demos/examples/Dashboard";
import { StoreExample } from "./demos/examples/Store";
import { OnboardingExample } from "./demos/examples/Onboarding";
import { MicrointeractionsExample } from "./demos/examples/Microinteractions";

export const registry: ComponentDemos[] = [
  StacksDemos,
  GroupDemos,
  SeparatorDemos,
  SpacerDemos,
  ScrollViewDemos,
  ShapesDemos,
  TextDemos,
  ButtonDemos,
  InputDemos,
  CheckboxDemos,
  SwitchDemos,
  RadioGroupDemos,
  SliderDemos,
  SelectDemos,
  ToggleGroupDemos,
  LabelDemos,
  FormDemos,
  DialogDemos,
  AlertDialogDemos,
  PopoverDemos,
  SheetDemos,
  TooltipDemos,
  ToastDemos,
  CardDemos,
  AvatarDemos,
  ImageDemos,
  ListItemDemos,
  ProgressDemos,
  SpinnerDemos,
  AccordionDemos,
  TabsDemos,
  VisuallyHiddenDemos,
  SignInExample,
  InputsExample,
  CheckboxCardsExample,
  GroupedRadioExample,
  SettingsExample,
  WritePreviewExample,
  ChipsExample,
  ButtonGalleryExample,
  AvatarsExample,
  UsersTableExample,
  TabBarExample,
  SlidingPopoverExample,
  DatePickerExample,
  PricingExample,
  DashboardExample,
  StoreExample,
  OnboardingExample,
  MicrointeractionsExample,
];

export const groupOrder: DemoGroup[] = [
  "Layout",
  "Typography",
  "Forms",
  "Overlays",
  "Content",
  "Feedback",
  "Navigation",
  "Utilities",
  "Examples",
];

export function findComponent(name: string): ComponentDemos | undefined {
  return registry.find((c) => c.name.toLowerCase() === name.toLowerCase());
}
