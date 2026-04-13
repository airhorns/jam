import { h } from "@jam/core/jsx";
import { $, remember, replace, when } from "@jam/core";

// Initial state
remember("counter", "count", 0);

export function CounterApp() {
  const value = (when(["counter", "count", $.value])[0]?.value as number) ?? 0;

  return (
    <div class="counter">
      <h1>{value}</h1>
      <div class="buttons">
        <button onClick={() => replace("counter", "count", value - 1)}>-</button>
        <button onClick={() => replace("counter", "count", value + 1)}>+</button>
      </div>
    </div>
  );
}
