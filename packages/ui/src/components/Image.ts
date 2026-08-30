import { styled } from "../styled";
import type { StyledProps } from "../styled";

export type ImageResizeMode = "cover" | "contain" | "stretch" | "center" | "repeat";

export type ImageProps = StyledProps & {
  src?: string;
  alt?: string;
  width?: string | number;
  height?: string | number;
  /** React-Native style fit mode, mapped onto `object-fit`. */
  resizeMode?: ImageResizeMode;
};

/**
 * Image: a styled `img`. `width`/`height`/`borderRadius` and every other style
 * prop work as usual; `objectFit` sets `object-fit` directly and `resizeMode`
 * accepts the React-Native spelling of the same thing.
 */
export const Image = styled<ImageProps>("img", {
  name: "Image",
  defaultProps: {
    display: "block",
    maxWidth: "100%",
    objectFit: "cover",
  },
  variants: {
    resizeMode: {
      cover: { objectFit: "cover" },
      contain: { objectFit: "contain" },
      stretch: { objectFit: "fill" },
      center: { objectFit: "none" },
      repeat: { objectFit: "none", backgroundRepeat: "repeat" },
    },
  },
});
