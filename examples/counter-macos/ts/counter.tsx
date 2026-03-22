import { $, when, render } from "./jam";
import { VStack, HStack, Text, Button } from "./components";

function CounterButton({ label }: { label: string }) {
    return <Button label={label} />;
}

render(
    <VStack key="app">
        <Text key="title" font="title">Jam Counter</Text>
        {when(["counter", "count", $.value], ({ value }) =>
            <Text key="display" font="largeTitle">{`Count: ${value}`}</Text>
        )}
        <HStack key="buttons">
            <CounterButton key="dec" label="-" />
            <CounterButton key="inc" label="+" />
        </HStack>
    </VStack>
);
