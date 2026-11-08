import type { ReactNode } from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

/**
 * The sidebar's top icon line, drawn as one set so the glyphs share a 24-unit grid, a 20-unit
 * outer bound, a 2-unit stroke and at least 3 units between parallel strokes. Lucide's versions
 * mix tighter gaps (Target's 2-unit rings) that blur at the 18pt sidebar size.
 */
interface SidebarNavIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function IconFrame({
  size = 16,
  color = "currentColor",
  strokeWidth = 2,
  children,
}: SidebarNavIconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function NewWorkspaceIcon(props: SidebarNavIconProps) {
  return (
    <IconFrame {...props}>
      <Circle cx={12} cy={12} r={10} />
      <Line x1={12} y1={7.5} x2={12} y2={16.5} />
      <Line x1={7.5} y1={12} x2={16.5} y2={12} />
    </IconFrame>
  );
}

export function HistoryIcon(props: SidebarNavIconProps) {
  return (
    <IconFrame {...props}>
      {/* Clockwise from the upper left round to 9 o'clock, so the gap reads as rewinding. */}
      <Path d="M5.64 5.64A9 9 0 1 1 3 12" />
      <Path d="M5.64 2v3.64H9.3" />
      <Path d="M12 7.5V12l3 2" />
    </IconFrame>
  );
}

export function SearchIcon(props: SidebarNavIconProps) {
  return (
    <IconFrame {...props}>
      <Circle cx={10.5} cy={10.5} r={7.5} />
      <Line x1={16} y1={16} x2={21} y2={21} />
    </IconFrame>
  );
}

export function SchedulesIcon(props: SidebarNavIconProps) {
  return (
    <IconFrame {...props}>
      <Circle cx={12} cy={13.5} r={7.5} />
      <Line x1={9.5} y1={2.5} x2={14.5} y2={2.5} />
      <Line x1={12} y1={13.5} x2={14.75} y2={10.75} />
    </IconFrame>
  );
}

export function GoalsIcon({ color = "currentColor", ...props }: SidebarNavIconProps) {
  return (
    <IconFrame color={color} {...props}>
      <Circle cx={12} cy={12} r={10} />
      <Circle cx={12} cy={12} r={5} />
      <Circle cx={12} cy={12} r={1.5} fill={color} stroke="none" />
    </IconFrame>
  );
}

export function AssistantIcon(props: SidebarNavIconProps) {
  return (
    <IconFrame {...props}>
      <Path d="M3 19v-7a9 9 0 0 1 18 0v7" />
      <Rect x={3} y={14} width={4.5} height={7} rx={1.75} />
      <Rect x={16.5} y={14} width={4.5} height={7} rx={1.75} />
    </IconFrame>
  );
}

export function DisplayPreferencesIcon(props: SidebarNavIconProps) {
  return (
    <IconFrame {...props}>
      <Line x1={3} y1={7} x2={11} y2={7} />
      <Line x1={19} y1={7} x2={21} y2={7} />
      <Circle cx={16} cy={7} r={3} />
      <Line x1={3} y1={17} x2={5} y2={17} />
      <Line x1={13} y1={17} x2={21} y2={17} />
      <Circle cx={8} cy={17} r={3} />
    </IconFrame>
  );
}
