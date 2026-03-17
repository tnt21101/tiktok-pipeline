import {ProgressBar} from "../elements/ProgressBar";
import {BaseTemplateScene, type TemplateSceneProps} from "./BaseTemplateScene";
import type {FC} from "react";

export const Listicle: FC<TemplateSceneProps> = (props) => {
  return (
    <BaseTemplateScene
      {...props}
      eyebrow="Countdown format"
      kicker="Keep every beat scannable, fast, and visually distinct."
      footer={<ProgressBar accentColor={props.brand.accentColor} />}
      accentAlign="right"
    />
  );
};
