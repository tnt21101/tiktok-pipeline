import {BaseTemplateScene, type TemplateSceneProps} from "./BaseTemplateScene";
import type {FC} from "react";

export const BrandStory: FC<TemplateSceneProps> = (props) => {
  return (
    <BaseTemplateScene
      {...props}
      eyebrow="Brand origin"
      kicker="Give the story room to breathe while the visuals stay premium."
      accentAlign="left"
    />
  );
};
