import {BaseTemplateScene, type TemplateSceneProps} from "./BaseTemplateScene";
import type {FC} from "react";

export const IngredientSpot: FC<TemplateSceneProps> = (props) => {
  return (
    <BaseTemplateScene
      {...props}
      eyebrow="Ingredient spotlight"
      kicker="Keep the ingredient tactile, cinematic, and on-brand."
      accentAlign="right"
    />
  );
};
