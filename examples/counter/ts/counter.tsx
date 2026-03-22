import { $, when, hold, render } from "./jam";
import { VStack, HStack, Text, Button } from "./components";

function CounterButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return <Button label={label} onPress={onPress} />;
}

hold("counter", [["counter", "count", 0]]);

render(
  <VStack key="app">
    {when(["counter", "count", $.value], ({ value }) => (
      <>
        <Text key="display" font="largeTitle">{`Count: ${value}`}</Text>
        <HStack key="buttons">
          <CounterButton
            key="dec"
            label="-"
            onPress={() => {
              hold("counter", [["counter", "count", value - 1]]);
            }}
          />
          <CounterButton
            key="inc"
            label="+"
            onPress={() => {
              hold("counter", [["counter", "count", value + 1]]);
            }}
          />
        </HStack>
      </>
    ))}
  </VStack>,
);
