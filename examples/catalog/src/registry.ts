import { DOC_GROUPS, groupDocs, type DocGroup } from "@jam/ui/docs";
import type { CatalogEntry, ComponentDemos, DemoGroup, ExampleDemos } from "./types";
import { componentDocs } from "./docs";
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
import { MenuDemos } from "./demos/Menu";
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
import { PortalDemos } from "./demos/Portal";
import { SlotDemos } from "./demos/Slot";
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

/** Demos per documented component, in the order they appear within their group. */
const componentDemos: ComponentDemos[] = [
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
  MenuDemos,
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
  PortalDemos,
  SlotDemos,
  VisuallyHiddenDemos,
];

const examples: ExampleDemos[] = [
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

type DocumentedEntry = CatalogEntry & { group: DocGroup };

function documentedEntries(): DocumentedEntry[] {
  const entries = componentDemos.map((demos): DocumentedEntry => {
    const doc = componentDocs.find((d) => d.name === demos.name);
    if (!doc) throw new Error(`Demos for "${demos.name}" have no doc in .agents/skills/jam-ui/components/${demos.name}.md`);
    return { name: doc.name, group: doc.group, description: doc.description, demos: demos.demos, doc };
  });
  const undemonstrated = componentDocs.filter((doc) => !componentDemos.some((demos) => demos.name === doc.name));
  if (undemonstrated.length > 0) {
    throw new Error(`Docs without demos in examples/catalog/src/demos: ${undemonstrated.map((doc) => doc.name).join(", ")}`);
  }
  return [...groupDocs(entries).values()].flat();
}

export const registry: CatalogEntry[] = [
  ...documentedEntries(),
  ...examples.map((example): CatalogEntry => ({ ...example, group: "Examples" })),
];

export const groupOrder: DemoGroup[] = [...DOC_GROUPS, "Examples"];

export function findComponent(name: string): CatalogEntry | undefined {
  return registry.find((c) => c.name.toLowerCase() === name.toLowerCase());
}
