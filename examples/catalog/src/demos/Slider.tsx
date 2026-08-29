import { h } from "@jam/core/jsx";
import { XStack, YStack, Slider, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const SliderDemos: ComponentDemos = {
  name: "Slider",
  group: "Forms",
  description: "A thumb dragged along a track to pick a number or a range.",
  demos: [
    {
      title: "Controlled",
      description: "Press anywhere on the track to jump the thumb there.",
      render: () => {
        const [value, setValue] = useDemoState("slider.value", 40);
        return (
          <YStack gap="$space.3" width={300}>
            <Slider
              value={value}
              onValueChange={(next) => setValue(next[0])}
              data-testid="volume-slider"
            >
              <Slider.Track>
                <Slider.TrackActive />
              </Slider.Track>
              <Slider.Thumb aria-label="Volume" data-testid="volume-thumb" />
            </Slider>
            <Text opacity={0.6} data-testid="volume-value">
              Volume: {value}
            </Text>
          </YStack>
        );
      },
      shot: { focus: "volume-thumb" },
    },
    {
      title: "Sizes",
      render: () => (
        <YStack gap="$space.6" width={300}>
          {["$2", "$3", "$4", "$6"].map((size) => (
            <Slider key={size} size={size} defaultValue={35}>
              <Slider.Track>
                <Slider.TrackActive />
              </Slider.Track>
              <Slider.Thumb aria-label={`Size ${size}`} />
            </Slider>
          ))}
        </YStack>
      ),
    },
    {
      title: "Range, steps and themes",
      description: "Thumbs cannot cross; a step of 10 snaps to the notches.",
      render: () => (
        <YStack gap="$space.6" width={300}>
          <Slider defaultValue={[20, 70]}>
            <Slider.Track>
              <Slider.TrackActive />
            </Slider.Track>
            <Slider.Thumb index={0} aria-label="Minimum" />
            <Slider.Thumb index={1} aria-label="Maximum" />
          </Slider>
          <Slider defaultValue={40} step={10}>
            <Slider.Track>
              <Slider.TrackActive />
            </Slider.Track>
            <Slider.Thumb aria-label="Stepped" />
          </Slider>
          {["blue", "green", "red"].map((theme) => (
            <Slider key={theme} theme={theme} defaultValue={65} size="$3">
              <Slider.Track>
                <Slider.TrackActive />
              </Slider.Track>
              <Slider.Thumb aria-label={theme} />
            </Slider>
          ))}
        </YStack>
      ),
    },
    {
      title: "Vertical and disabled",
      render: () => (
        <XStack gap="$space.8" alignItems="flex-start">
          <Slider defaultValue={60} orientation="vertical" height={160}>
            <Slider.Track>
              <Slider.TrackActive />
            </Slider.Track>
            <Slider.Thumb aria-label="Vertical" />
          </Slider>
          <Slider defaultValue={[30, 80]} orientation="vertical" height={160} size="$3">
            <Slider.Track>
              <Slider.TrackActive />
            </Slider.Track>
            <Slider.Thumb index={0} aria-label="Low" />
            <Slider.Thumb index={1} aria-label="High" />
          </Slider>
          <YStack gap="$space.5" width={220}>
            <Slider defaultValue={50} disabled>
              <Slider.Track>
                <Slider.TrackActive />
              </Slider.Track>
              <Slider.Thumb aria-label="Disabled" />
            </Slider>
            <Slider defaultValue={0}>
              <Slider.Track>
                <Slider.TrackActive />
              </Slider.Track>
              <Slider.Thumb aria-label="At the minimum" />
            </Slider>
            <Slider defaultValue={100}>
              <Slider.Track>
                <Slider.TrackActive />
              </Slider.Track>
              <Slider.Thumb aria-label="At the maximum" />
            </Slider>
          </YStack>
        </XStack>
      ),
    },
  ],
};
