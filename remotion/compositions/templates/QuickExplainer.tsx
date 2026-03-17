import {BaseTemplateScene, type TemplateSceneProps} from "./BaseTemplateScene";
import type {FC} from "react";

export const QuickExplainer: FC<TemplateSceneProps> = (props) => {
  return (
    <BaseTemplateScene
      {...props}
      eyebrow="Quick explainer"
      kicker="One strong fact, one visual proof, one takeaway."
      accentAlign="left"
    />
  );
};
