import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, Button, Card, Input, Label, Popover, Separator, SizableText, useStableId } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

const today = new Date(2026, 7, 29);
const CELL = 36;
const ROW_GAP = 2;
const GRID_WIDTH = CELL * 7;
const WEEKDAY_ROW_HEIGHT = 20;
const DAY_VIEW_HEIGHT = WEEKDAY_ROW_HEIGHT + 8 + CELL * 6 + ROW_GAP * 5;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const formatDate = (iso: string) => {
  if (!iso) return "";
  const d = fromISO(iso);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
};
const daysBetween = (a: string, b: string) => Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);

/** Six weeks of dates covering the month, starting on the Sunday on or before the 1st. */
function monthDays(year: number, month: number): Date[] {
  const offset = new Date(year, month, 1).getDay();
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));
}

function useVisibleMonth(key: string, initial: Date) {
  const [value, set] = useDemoState(`${key}.month`, `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}`);
  const [year, month] = value.split("-").map(Number);
  return {
    year,
    month: month - 1,
    show: (y: number, m: number) => {
      const d = new Date(y, m, 1);
      set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    },
  };
}

function CalendarHeader({ title, onPrev, onNext, onTitleClick, testId }: { title: string; onPrev: () => void; onNext: () => void; onTitleClick?: () => void; testId?: string }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" width={GRID_WIDTH}>
      <Button size="$3" circular chromeless aria-label="Previous" icon={<ChevronLeftIcon size={16} />} onClick={onPrev} />
      {onTitleClick ? (
        <Button size="$3" chromeless fontWeight="600" fontSize={15} onClick={onTitleClick} data-testid={testId}>
          {title}
        </Button>
      ) : (
        <SizableText size="$4" fontWeight="600">{title}</SizableText>
      )}
      <Button size="$3" circular chromeless aria-label="Next" icon={<ChevronRightIcon size={16} />} onClick={onNext} />
    </XStack>
  );
}

function WeekdayRow() {
  return (
    <XStack width={GRID_WIDTH} height={WEEKDAY_ROW_HEIGHT} alignItems="center">
      {WEEKDAYS.map((day) => (
        <SizableText key={day} size="$2" color="$color10" width={CELL} textAlign="center" userSelect="none">
          {day}
        </SizableText>
      ))}
    </XStack>
  );
}

const GRID_COLUMNS = 7;

function isGridDisabled(el: Element): boolean {
  return el.hasAttribute("disabled") || el.hasAttribute("data-disabled");
}

/** The day that should be the grid's one Tab stop: the selected day if it's in view, else today if it's in view, else the month's first day. */
function focusableDay(days: Date[], month: number, selectedISOs: string[]): string {
  const isos = days.map(toISO);
  const inView = selectedISOs.find((iso) => iso && isos.includes(iso));
  if (inView) return inView;
  const todayISO = toISO(today);
  if (isos.includes(todayISO)) return todayISO;
  return toISO(days.find((d) => d.getMonth() === month) ?? days[0]);
}

/** APG grid navigation for the day cells: arrows move by row/column, Home/End jump to the focused row's ends, skipping disabled cells and clamping to the grid's bounds. */
function moveDayFocus(event: KeyboardEvent, selector: string): HTMLElement | null {
  const target = event.target as HTMLElement | null;
  if (!target?.matches(selector)) return null;
  const container = event.currentTarget as HTMLElement;
  const cells = Array.from(container.querySelectorAll<HTMLElement>(selector));
  const from = cells.indexOf(target);
  if (from === -1) return null;

  const rowStart = from - (from % GRID_COLUMNS);
  let to: number;
  if (event.key === "ArrowLeft") to = from - 1;
  else if (event.key === "ArrowRight") to = from + 1;
  else if (event.key === "ArrowUp") to = from - GRID_COLUMNS;
  else if (event.key === "ArrowDown") to = from + GRID_COLUMNS;
  else if (event.key === "Home") to = rowStart;
  else if (event.key === "End") to = rowStart + GRID_COLUMNS - 1;
  else return null;

  const step = to >= from ? 1 : -1;
  to = Math.min(Math.max(to, 0), cells.length - 1);
  while (isGridDisabled(cells[to])) {
    const next = to + step;
    if (next < 0 || next >= cells.length) break;
    to = next;
  }
  if (isGridDisabled(cells[to])) return null;

  event.preventDefault();
  cells[to].focus();
  return cells[to];
}

function DayGrid({ year, month, selectedISOs, renderDay }: { year: number; month: number; selectedISOs: string[]; renderDay: (date: Date, inMonth: boolean, tabbable: boolean) => VChild }) {
  const days = monthDays(year, month);
  const focused = focusableDay(days, month, selectedISOs);
  return (
    <YStack width={GRID_WIDTH} gap={ROW_GAP} role="grid" onKeyDown={(event: KeyboardEvent) => moveDayFocus(event, "[data-day]")}>
      {Array.from({ length: 6 }, (_, row) => (
        <XStack key={row} role="row">{days.slice(row * 7, row * 7 + 7).map((date) => renderDay(date, date.getMonth() === month, toISO(date) === focused))}</XStack>
      ))}
    </YStack>
  );
}

function DayView({ year, month, selectedISOs, renderDay }: { year: number; month: number; selectedISOs: string[]; renderDay: (date: Date, inMonth: boolean, tabbable: boolean) => VChild }) {
  return (
    <YStack gap={8} height={DAY_VIEW_HEIGHT}>
      <WeekdayRow />
      <DayGrid year={year} month={month} selectedISOs={selectedISOs} renderDay={renderDay} />
    </YStack>
  );
}

type Band = "start" | "middle" | "end";

function DayCell({ date, inMonth, selected, tabbable, band, onClick }: { date: Date; inMonth: boolean; selected: boolean; tabbable: boolean; band?: Band; onClick: () => void }) {
  const isToday = toISO(date) === toISO(today);
  const outlined = isToday && !selected;
  const roundLeft = band === "start";
  const roundRight = band === "end";
  return (
    <YStack
      role="gridcell"
      width={CELL}
      height={CELL}
      alignItems="center"
      justifyContent="center"
      backgroundColor={band ? "$color4" : undefined}
      borderTopLeftRadius={roundLeft ? CELL / 2 : 0}
      borderBottomLeftRadius={roundLeft ? CELL / 2 : 0}
      borderTopRightRadius={roundRight ? CELL / 2 : 0}
      borderBottomRightRadius={roundRight ? CELL / 2 : 0}
    >
      <Button
        size="$3"
        circular
        chromeless
        theme={selected ? "accent" : undefined}
        backgroundColor={selected ? "$background" : undefined}
        color={selected || inMonth ? undefined : "$color8"}
        borderColor={outlined ? "$color8" : undefined}
        hoverStyle={outlined ? { borderColor: "$color8" } : undefined}
        fontWeight={selected || isToday ? "600" : "400"}
        aria-label={date.toDateString()}
        aria-pressed={selected}
        data-day={toISO(date)}
        tabIndex={tabbable ? 0 : -1}
        onClick={onClick}
      >
        {String(date.getDate())}
      </Button>
    </YStack>
  );
}

function PopoverDatePicker() {
  const key = "datepicker.popover";
  const id = useStableId("date");
  const [selected, setSelected] = useDemoState(`${key}.selected`, "2026-08-14");
  const [open, setOpen] = useDemoState(`${key}.open`, false);
  const view = useVisibleMonth(key, selected ? fromISO(selected) : today);

  const showMonthOf = (iso: string) => {
    const d = fromISO(iso);
    view.show(d.getFullYear(), d.getMonth());
  };
  const setOpenAndReset = (next: boolean) => {
    if (next && selected) showMonthOf(selected);
    setOpen(next);
  };
  const choose = (iso: string) => {
    setSelected(iso);
    if (iso) showMonthOf(iso);
    setOpen(false);
  };

  return (
    <YStack gap="$space.1" width={280}>
      <Label htmlFor={id} size="$3">Due date</Label>
      <Popover open={open} placement="bottom-start" onOpenChange={setOpenAndReset}>
        <XStack position="relative" alignItems="center">
          <Popover.Trigger asChild>
            <Input
              id={id}
              readOnly
              value={formatDate(selected)}
              placeholder="Pick a date"
              width="100%"
              paddingRight={40}
              cursor="pointer"
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpenAndReset(true);
                }
              }}
              data-testid="datepicker-input"
            />
          </Popover.Trigger>
          <YStack position="absolute" right={14} pointerEvents="none" color="$color10">
            <CalendarIcon size={16} />
          </YStack>
        </XStack>
        <Popover.Content padding="$space.3">
          <Popover.Arrow />
          <YStack gap="$space.2">
            <CalendarHeader
              title={`${MONTHS[view.month]} ${view.year}`}
              onPrev={() => view.show(view.year, view.month - 1)}
              onNext={() => view.show(view.year, view.month + 1)}
            />
            <DayView year={view.year} month={view.month} selectedISOs={[selected]} renderDay={(date, inMonth, tabbable) => <DayCell key={toISO(date)} date={date} inMonth={inMonth} selected={toISO(date) === selected} tabbable={tabbable} onClick={() => choose(toISO(date))} />} />
            <Separator marginVertical="$space.1" />
            <XStack justifyContent="space-between">
              <Button size="$2" chromeless onClick={() => choose(toISO(today))}>Today</Button>
              <Button size="$2" chromeless color="$color10" onClick={() => choose("")}>Clear</Button>
            </XStack>
          </YStack>
        </Popover.Content>
      </Popover>
    </YStack>
  );
}

type HeaderMode = "day" | "month" | "year";

function InlineCalendar() {
  const key = "datepicker.inline";
  const [selected, setSelected] = useDemoState(`${key}.selected`, "2026-08-14");
  const [mode, setMode] = useDemoState<HeaderMode>(`${key}.mode`, "day");
  const view = useVisibleMonth(key, fromISO(selected));
  const yearBase = Math.floor(view.year / 12) * 12;
  const years = Array.from({ length: 12 }, (_, i) => yearBase + i);

  const header =
    mode === "day"
      ? { title: `${MONTHS[view.month]} ${view.year}`, step: 1, next: "month" as const }
      : mode === "month"
        ? { title: String(view.year), step: 12, next: "year" as const }
        : { title: `${years[0]} – ${years[11]}`, step: 144, next: "day" as const };

  const choice = (label: string, active: boolean, onClick: () => void) => (
    <Button key={label} size="$3" chromeless flex={1} height={52} theme={active ? "accent" : undefined} backgroundColor={active ? "$background" : undefined} fontWeight={active ? "600" : "400"} onClick={onClick}>
      {label}
    </Button>
  );
  const rows = (items: VChild[]) => (
    <YStack width={GRID_WIDTH} height={DAY_VIEW_HEIGHT} justifyContent="space-between">
      {Array.from({ length: 4 }, (_, row) => (
        <XStack key={row} gap="$space.2">{items.slice(row * 3, row * 3 + 3)}</XStack>
      ))}
    </YStack>
  );

  return (
    <Card bordered elevate padding="$space.4">
      <YStack gap="$space.2">
        <CalendarHeader
          title={header.title}
          onPrev={() => view.show(view.year, view.month - header.step)}
          onNext={() => view.show(view.year, view.month + header.step)}
          onTitleClick={() => setMode(header.next)}
          testId="datepicker-title"
        />
        {mode === "day" ? (
          <DayView year={view.year} month={view.month} selectedISOs={[selected]} renderDay={(date, inMonth, tabbable) => <DayCell key={toISO(date)} date={date} inMonth={inMonth} selected={toISO(date) === selected} tabbable={tabbable} onClick={() => { setSelected(toISO(date)); view.show(date.getFullYear(), date.getMonth()); }} />} />
        ) : mode === "month" ? (
          rows(MONTHS.map((name, i) => choice(name.slice(0, 3), i === view.month, () => { view.show(view.year, i); setMode("day"); })))
        ) : (
          rows(years.map((y) => choice(String(y), y === view.year, () => { view.show(y, view.month); setMode("month"); })))
        )}
        <Separator marginVertical="$space.1" />
        <XStack width={GRID_WIDTH} alignItems="center" justifyContent="space-between">
          <SizableText size="$2" color="$color11">{selected ? formatDate(selected) : "No date selected"}</SizableText>
          <Button size="$2" chromeless onClick={() => { setSelected(toISO(today)); view.show(today.getFullYear(), today.getMonth()); setMode("day"); }}>Today</Button>
        </XStack>
      </YStack>
    </Card>
  );
}

function RangeCalendar() {
  const key = "datepicker.range";
  const [start, setStart] = useDemoState(`${key}.start`, "2026-08-10");
  const [end, setEnd] = useDemoState(`${key}.end`, "2026-08-21");
  const view = useVisibleMonth(key, fromISO(start || toISO(today)));

  const pick = (iso: string) => {
    if (!start || end) {
      setStart(iso);
      setEnd("");
    } else if (iso < start) {
      setEnd(start);
      setStart(iso);
    } else {
      setEnd(iso);
    }
  };
  const bandFor = (iso: string): Band | undefined => {
    if (!start || !end || iso < start || iso > end || start === end) return undefined;
    return iso === start ? "start" : iso === end ? "end" : "middle";
  };
  const summary = !start ? "Pick a start date" : !end ? `${formatDate(start)} – …` : `${formatDate(start)} – ${formatDate(end)}`;
  const dayCount = start && end ? daysBetween(start, end) + 1 : 0;
  const detail = !start ? "" : !end ? "Now pick an end date" : `${dayCount} ${dayCount === 1 ? "day" : "days"}`;

  return (
    <Card bordered elevate padding="$space.4">
      <YStack gap="$space.2">
        <CalendarHeader
          title={`${MONTHS[view.month]} ${view.year}`}
          onPrev={() => view.show(view.year, view.month - 1)}
          onNext={() => view.show(view.year, view.month + 1)}
        />
        <DayView
          year={view.year}
          month={view.month}
          selectedISOs={[start, end]}
          renderDay={(date, inMonth, tabbable) => {
            const iso = toISO(date);
            return <DayCell key={iso} date={date} inMonth={inMonth} selected={iso === start || iso === end} tabbable={tabbable} band={bandFor(iso)} onClick={() => pick(iso)} />;
          }}
        />
        <Separator marginVertical="$space.1" />
        <XStack width={GRID_WIDTH} alignItems="center" justifyContent="space-between" gap="$space.3">
          <YStack flex={1} minWidth={0}>
            <SizableText size="$2" color="$color11" ellipsis>{summary}</SizableText>
            <SizableText size="$1" color="$color10">{detail}</SizableText>
          </YStack>
          <Button size="$2" chromeless color="$color10" onClick={() => { setStart(""); setEnd(""); }}>Clear</Button>
        </XStack>
      </YStack>
    </Card>
  );
}

export const DatePickerExample: ComponentDemos = {
  name: "Date picker",
  group: "Examples",
  description: "Calendars built from Buttons in a fixed 7-column grid: a popover picker behind a read-only input, an inline calendar with month and year pickers, and a range picker.",
  demos: [
    {
      title: "Popover date picker",
      description: "A read-only input opens a calendar popover; picking a day, Today or Clear closes it.",
      render: () => <PopoverDatePicker />,
      shot: { click: "datepicker-input", wait: 400 },
    },
    {
      title: "Inline calendar",
      description: "Click the month title to pick a month, then the year to pick from a range of years.",
      render: () => <InlineCalendar />,
      shot: { click: "datepicker-title", wait: 300 },
    },
    {
      title: "Range",
      description: "Pick a start and an end date; days between are banded.",
      render: () => <RangeCalendar />,
    },
  ],
};
