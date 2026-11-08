/**
 * The app's icon set: drop-in replacements for the Lucide icons the app uses, drawn on one
 * grid for the app's 2.5 stroke (see ./glyphs.ts). Built with Lucide's own factory, so size,
 * color, stroke width and `LucideProvider` defaults behave exactly as before.
 *
 * Import icons from here, not from lucide-react-native. To add one, draw it in ./glyphs.ts and
 * export it below under the Lucide name call sites expect.
 */
import { createElement, forwardRef } from "react";
import {
  createLucideIcon,
  useLucideContext,
  type LucideIcon,
  type LucideProps,
} from "lucide-react-native";
import { GLYPHS, type GlyphName } from "./glyphs";

export { LucideProvider, type LucideIcon, type LucideProps } from "lucide-react-native";

type IconNode = Parameters<typeof createLucideIcon>[1];

/** Up to this size the stroke scales with the icon, as Lucide draws it. */
const FULL_STROKE_SIZE = 18;
/** Past it, each extra pixel of icon adds this much stroke, in pixels. */
const STROKE_GROWTH = 0.035;

/**
 * A grid-relative stroke turns heavy on large icons (2.5 units is 4.6px at 44px), so past
 * FULL_STROKE_SIZE the drawn stroke grows slowly instead of in proportion. Only ever thins:
 * the glyph gaps are drawn for the full stroke.
 */
export function resolveIconStrokeWidth(strokeWidth: number, size: number): number {
  if (!(size > FULL_STROKE_SIZE)) return strokeWidth;
  const fullPixels = (strokeWidth * FULL_STROKE_SIZE) / 24;
  const cappedPixels = fullPixels + (size - FULL_STROKE_SIZE) * STROKE_GROWTH;
  return Math.min(strokeWidth, (cappedPixels * 24) / size);
}

function glyph(name: GlyphName): LucideIcon {
  const node = GLYPHS[name].map(([element, attrs], index) => [
    element,
    { ...attrs, key: String(index) },
  ]) as IconNode;
  const Base = createLucideIcon(name, node);
  const Icon = forwardRef<unknown, LucideProps>(function AppIcon(props, ref) {
    const context = useLucideContext();
    if (props.absoluteStrokeWidth ?? context.absoluteStrokeWidth) {
      return createElement(Base, { ...props, ref } as LucideProps);
    }
    const size = Number(props.size ?? context.size ?? 24);
    const strokeWidth = resolveIconStrokeWidth(
      Number(props.strokeWidth ?? context.strokeWidth ?? 2),
      size,
    );
    return createElement(Base, { ...props, strokeWidth, ref } as LucideProps);
  });
  Icon.displayName = Base.displayName;
  return Icon as unknown as LucideIcon;
}

export const Activity = glyph("activity");
export const AlertCircle = glyph("circle-alert");
export const AlertTriangle = glyph("triangle-alert");
export const AlignJustify = glyph("text-align-justify");
export const Archive = glyph("archive");
export const ArrowDown = glyph("arrow-down");
export const ArrowDownToLine = glyph("arrow-down-to-line");
export const ArrowDownUp = glyph("arrow-down-up");
export const ArrowLeft = glyph("arrow-left");
export const ArrowLeftToLine = glyph("arrow-left-to-line");
export const ArrowRight = glyph("arrow-right");
export const ArrowRightToLine = glyph("arrow-right-to-line");
export const ArrowUp = glyph("arrow-up");
export const ArrowUpRight = glyph("arrow-up-right");
export const ArrowUpToLine = glyph("arrow-up-to-line");
export const AudioLines = glyph("audio-lines");
export const Bell = glyph("bell");
export const Blocks = glyph("blocks");
export const BookOpen = glyph("book-open");
export const Bot = glyph("bot");
export const Boxes = glyph("boxes");
export const Brain = glyph("brain");
export const Bug = glyph("bug");
export const CalendarClock = glyph("calendar-clock");
export const Camera = glyph("camera");
export const Captions = glyph("captions");
export const Check = glyph("check");
export const CheckCircle = glyph("circle-check-big");
export const CheckCircle2 = glyph("circle-check");
export const CheckSquare = glyph("square-check-big");
export const ChevronDown = glyph("chevron-down");
export const ChevronLeft = glyph("chevron-left");
export const ChevronRight = glyph("chevron-right");
export const ChevronUp = glyph("chevron-up");
export const Circle = glyph("circle");
export const CircleAlert = AlertCircle;
export const CircleCheck = CheckCircle2;
export const CircleDashed = glyph("circle-dashed");
export const CircleDot = glyph("circle-dot");
export const CircleGauge = glyph("circle-gauge");
export const CircleHelp = glyph("circle-question-mark");
export const CirclePlus = glyph("circle-plus");
export const CircleSlash = glyph("circle-slash");
export const CircleX = glyph("circle-x");
export const ClipboardPaste = glyph("clipboard-paste");
export const Clock = glyph("clock");
export const Cloud = glyph("cloud");
export const Code = glyph("code");
export const Code2 = glyph("code-xml");
export const Columns2 = glyph("columns-2");
export const Compass = glyph("compass");
export const Copy = glyph("copy");
export const CopyPlus = glyph("copy-plus");
export const CopyX = glyph("copy-x");
export const CornerDownLeft = glyph("corner-down-left");
export const CornerUpLeft = glyph("corner-up-left");
export const Cpu = glyph("cpu");
export const Database = glyph("database");
export const Diff = glyph("diff");
export const Download = glyph("download");
export const Ellipsis = glyph("ellipsis");
export const ExternalLink = glyph("external-link");
export const Eye = glyph("eye");
export const EyeOff = glyph("eye-off");
export const Feather = glyph("feather");
export const File = glyph("file");
export const FileDiff = glyph("file-diff");
export const FilePlus = glyph("file-plus");
export const Files = glyph("files");
export const FileSymlink = glyph("file-symlink");
export const FileText = glyph("file-text");
export const FileWarning = glyph("file-exclamation-point");
export const FlaskConical = glyph("flask-conical");
export const Focus = glyph("focus");
export const Folder = glyph("folder");
export const FolderGit2 = glyph("folder-git-2");
export const FolderMinus = glyph("folder-minus");
export const FolderOpen = glyph("folder-open");
export const FolderPlus = glyph("folder-plus");
export const FolderTree = glyph("folder-tree");
export const Gauge = glyph("gauge");
export const Gift = glyph("gift");
export const GitBranch = glyph("git-branch");
export const GitCommitHorizontal = glyph("git-commit-horizontal");
export const GitCompareArrows = glyph("git-compare-arrows");
export const GitMerge = glyph("git-merge");
export const GitPullRequest = glyph("git-pull-request");
export const GitPullRequestClosed = glyph("git-pull-request-closed");
export const GitPullRequestDraft = glyph("git-pull-request-draft");
export const Globe = glyph("globe");
export const Hammer = glyph("hammer");
export const HardDrive = glyph("hard-drive");
export const Headphones = glyph("headphones");
export const History = glyph("rotate-ccw-clock");
export const Home = glyph("house");
export const Image = glyph("image");
export const Import = glyph("import");
export const Inbox = glyph("inbox");
export const Info = glyph("info");
export const Keyboard = glyph("keyboard");
export const KeyboardOff = glyph("keyboard-off");
export const Languages = glyph("languages");
export const Laptop = glyph("laptop");
export const Layers = glyph("layers");
export const Link = glyph("link");
export const Link2 = glyph("link-2");
export const ListChecks = glyph("list-checks");
export const ListChevronsDownUp = glyph("list-chevrons-down-up");
export const ListChevronsUpDown = glyph("list-chevrons-up-down");
export const ListMinus = glyph("list-minus");
export const ListPlus = glyph("list-plus");
export const ListTodo = glyph("list-todo");
export const Maximize = glyph("maximize");
export const Maximize2 = glyph("maximize-2");
export const Menu = glyph("menu");
export const MessageCircle = glyph("message-circle");
export const MessageSquare = glyph("message-square");
export const MessageSquareCode = glyph("message-square-code");
export const MessageSquarePlus = glyph("message-square-plus");
export const Mic = glyph("mic");
export const MicOff = glyph("mic-off");
export const Microscope = glyph("microscope");
export const MicVocal = glyph("mic-vocal");
export const Minimize = glyph("minimize");
export const Minimize2 = glyph("minimize-2");
export const Monitor = glyph("monitor");
export const Moon = glyph("moon");
export const MoreHorizontal = Ellipsis;
export const MoreVertical = glyph("ellipsis-vertical");
export const MousePointer2 = glyph("mouse-pointer-2");
export const Move = glyph("move");
export const Network = glyph("network");
export const Package = glyph("package");
export const PackagePlus = glyph("package-plus");
export const Palette = glyph("palette");
export const PanelLeft = glyph("panel-left");
export const PanelRight = glyph("panel-right");
export const Paperclip = glyph("paperclip");
export const Pause = glyph("pause");
export const Pencil = glyph("pencil");
export const Pilcrow = glyph("pilcrow");
export const Pin = glyph("pin");
export const PinOff = glyph("pin-off");
export const Play = glyph("play");
export const Plug = glyph("plug");
export const Plus = glyph("plus");
export const Puzzle = glyph("puzzle");
export const QrCode = glyph("qr-code");
export const RefreshCcw = glyph("refresh-ccw");
export const Rocket = glyph("rocket");
export const RotateCw = glyph("rotate-cw");
export const Rows2 = glyph("rows-2");
export const Scan = glyph("scan");
export const Scissors = glyph("scissors");
export const Search = glyph("search");
export const Send = glyph("send");
export const Server = glyph("server");
export const Settings = glyph("settings");
export const Settings2 = glyph("settings-2");
export const Shield = glyph("shield");
export const ShieldAlert = glyph("shield-alert");
export const ShieldCheck = glyph("shield-check");
export const ShieldEllipsis = glyph("shield-ellipsis");
export const ShieldOff = glyph("shield-off");
export const ShieldPlus = glyph("shield-plus");
export const ShieldQuestionMark = glyph("shield-question-mark");
export const Smartphone = glyph("smartphone");
export const Sparkles = glyph("sparkles");
export const Split = glyph("split");
export const Square = glyph("square");
export const SquareDot = glyph("square-dot");
export const SquareMinus = glyph("square-minus");
export const SquarePen = glyph("square-pen");
export const SquarePlus = glyph("square-plus");
export const SquareTerminal = glyph("square-terminal");
export const Star = glyph("star");
export const Stethoscope = glyph("stethoscope");
export const Summary = glyph("summary");
export const Sun = glyph("sun");
export const Tablet = glyph("tablet");
export const Tag = glyph("tag");
export const Target = glyph("target");
export const Terminal = glyph("terminal");
export const TestTube = glyph("test-tube");
export const Timer = glyph("timer");
export const Trash2 = glyph("trash");
export const TriangleAlertIcon = AlertTriangle;
export const Type = glyph("type");
export const Undo2 = glyph("undo-2");
export const Unlink = glyph("unlink");
export const Upload = glyph("upload");
export const UserRound = glyph("user-round");
export const Workflow = glyph("workflow");
export const WrapText = glyph("text-wrap");
export const Wrench = glyph("wrench");
export const X = glyph("x");
export const XCircle = CircleX;
export const Zap = glyph("zap");
export const ZoomIn = glyph("zoom-in");
export const ZoomOut = glyph("zoom-out");
