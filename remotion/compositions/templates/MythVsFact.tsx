import {BaseTemplateScene, type TemplateSceneProps} from "./BaseTemplateScene";
import type {FC} from "react";

export const MythVsFact: FC<TemplateSceneProps> = (props) => {
  return (
    <BaseTemplateScene
      {...props}
      eyebrow="Myth vs fact"
      kicker="Correct the habit fast and make the better method feel obvious."
      accentAlign="right"
    />
  );
};
