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
