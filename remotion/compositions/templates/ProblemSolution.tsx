import {BaseTemplateScene, type TemplateSceneProps} from "./BaseTemplateScene";
import type {FC} from "react";

export const ProblemSolution: FC<TemplateSceneProps> = (props) => {
  return (
    <BaseTemplateScene
      {...props}
      eyebrow="Problem to payoff"
      kicker="Show the friction. Show the fix. Land the result."
      accentAlign="left"
    />
  );
};
