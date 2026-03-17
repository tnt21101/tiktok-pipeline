import {BaseTemplateScene, type TemplateSceneProps} from "./BaseTemplateScene";
import type {FC} from "react";

export const BeforeAfter: FC<TemplateSceneProps> = (props) => {
  return (
    <BaseTemplateScene
      {...props}
      eyebrow="Before and after"
      kicker="Make the contrast unmistakable and keep the turning point clean."
      accentAlign="right"
    />
  );
};
