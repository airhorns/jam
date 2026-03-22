import { $, _, when, claim, $this, child } from "./jam";

// Reusable button component
function CounterButton(label: string, action: string) {
    claim($this, "isa", "Button");
    claim($this, "label", label);
    claim($this, "action", action);
}

// Root layout
claim($this, "isa", "VStack");

child("title", () => {
    claim($this, "isa", "Text");
    claim($this, "text", "Jam Counter");
    claim($this, "font", "title");
});

// Reactive: derive display from count (asserted by Swift host)
when(["counter", "count", $.value], ({ value }) => {
    child("count-display", () => {
        claim($this, "isa", "Text");
        claim($this, "text", `Count: ${value}`);
        claim($this, "font", "largeTitle");
    });
});

child("buttons", () => {
    claim($this, "isa", "HStack");
    child("dec", () => CounterButton("-", "decrement"));
    child("inc", () => CounterButton("+", "increment"));
});
