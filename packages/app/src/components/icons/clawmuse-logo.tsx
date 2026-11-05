import Svg, { Path } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";
import { brandSymbol } from "./brand-symbol.generated";

interface ClawMuseLogoProps {
  size?: number;
  color?: string;
}

function Logo({ size = 64, color }: ClawMuseLogoProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={brandSymbol.viewBox}
      fill="none"
      stroke={color}
      strokeWidth={brandSymbol.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {brandSymbol.paths.map(({ id, d }) => (
        <Path key={id} d={d} />
      ))}
    </Svg>
  );
}

export const ClawMuseLogo = withUnistyles(Logo, (theme) => ({ color: theme.colors.foreground }));
