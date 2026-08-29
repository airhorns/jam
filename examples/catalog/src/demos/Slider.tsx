import { h } from "@jam/core/jsx";
import { XStack, YStack, Slider, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const SliderDemos: ComponentDemos = {
  name: "Slider",
  group: "Forms",
  demos: [
    {
      title: "Controlled",
      render: () => {
        const [value, setValue] = useDemoState("slider.value", 40);
        return (
          <YStack gap="$space.3" width={300}>
            <Slider value={[value]} max={100} step={1} onValueChange={(v) => setValue(v[0])} data-testid="volume-slider">
              <Slider.Track><Slider.TrackActive /></Slider.Track>
              <Slider.Thumb index={0} />
            </Slider>
            <Text opacity={0.6} data-testid="volume-value">Value: {value}</Text>
          </YStack>
        );
      },
    },
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.5" width={300}>
          {["1", "2", "3", "4"].map((size) => (
            <Slider key={size} size={size} defaultValue={[30]} max={100}>
              <Slider.Track><Slider.TrackActive /></Slider.Track>
              <Slider.Thumb index={0} />
            </Slider>
          ))}
        </YStack>
      ),
    },
    {
      title: "Range and vertical",
      render: () => (
        <XStack gap="$space.8" alignItems="flex-start">
          <Slider defaultValue={[20, 70]} max={100} width={300}>
            <Slider.Track><Slider.TrackActive /></Slider.Track>
            <Slider.Thumb index={0} />
            <Slider.Thumb index={1} />
          </Slider>
          <Slider defaultValue={[60]} max={100} orientation="vertical" height={160}>
            <Slider.Track><Slider.TrackActive /></Slider.Track>
            <Slider.Thumb index={0} />
          </Slider>
        </XStack>
      ),
    },
    {
      title: "Disabled",
      render: () => (
        <Slider defaultValue={[50]} max={100} width={300} disabled>
          <Slider.Track><Slider.TrackActive /></Slider.Track>
          <Slider.Thumb index={0} />
        </Slider>
      ),
    },
  ],
};
