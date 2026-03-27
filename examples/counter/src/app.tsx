import { h } from "@jam/core/jsx";
import { $, set, when } from "@jam/core";

// Initial state
set("counter", "count", 0);

export function CounterApp() {
  const count = when(["counter", "count", $.value]);
  const value = (count.get()[0]?.value as number) ?? 0;

  return (
    <div class="counter">
      <h1>{value}</h1>
      <div class="buttons">
        <button onClick={() => set("counter", "count", value - 1)}>-</button>
        <button onClick={() => set("counter", "count", value + 1)}>+</button>
      </div>
    </div>
  );
}
