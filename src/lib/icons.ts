/**
 * Centralized icon wrapper.
 *
 * The app used to import directly from `lucide-react` in ~99 files. To migrate
 * the whole UI to Heroicons without touching every JSX call site, this module
 * re-exports Heroicons under the same names we used for Lucide. Components
 * keep importing `Folder`, `Search`, `X`, etc. — they just now come from
 * `@/lib/icons` instead of `lucide-react`, and render a Heroicon under the
 * hood.
 *
 * Icons that have no good Heroicons equivalent (brand marks, Git-specific
 * glyphs, niche scientific icons) fall back to Lucide so visuals stay
 * sensible. That keeps Lucide in the bundle for a handful of names only;
 * tree-shaking drops the rest.
 *
 * Heroicons outline 24x24 is the baseline — the stroke-1.5 feel matches the
 * ChatGPT/Claude look the redesign is targeting. All icons accept
 * `className` (size via Tailwind h-N and w-N utilities). Heroicons do NOT
 * accept Lucide's `size` or `strokeWidth` props — if any call site needs
 * those, migrate them to className-based sizing at that site.
 */

import type { ComponentType, SVGProps } from 'react';
import {
  AdjustmentsHorizontalIcon,
  ArrowDownIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowRightEndOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpCircleIcon,
  ArrowUpIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowsUpDownIcon,
  Bars3Icon,
  BellAlertIcon,
  BellIcon,
  BellSlashIcon,
  BoltIcon,
  BookOpenIcon,
  BookmarkSquareIcon,
  BugAntIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ClipboardDocumentCheckIcon,
  ClipboardIcon,
  ClockIcon,
  CloudIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  FlagIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  FunnelIcon,
  GlobeAltIcon,
  InboxIcon,
  InformationCircleIcon,
  KeyIcon,
  LanguageIcon,
  ListBulletIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  MoonIcon,
  PaperAirplaneIcon,
  PauseIcon,
  PencilIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlayIcon,
  PlusIcon,
  PuzzlePieceIcon,
  QuestionMarkCircleIcon,
  QueueListIcon,
  ServerIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  SparklesIcon,
  Squares2X2Icon,
  StarIcon,
  StopIcon,
  SunIcon,
  SwatchIcon,
  TableCellsIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// Brand and niche icons that Heroicons does not ship — keep on Lucide.
// File-type icons (Archive, Braces, Hexagon, …) live here too because
// Heroicons doesn't have distinct marks for each language/format; the
// file tree's dense icon matrix is nicer with Lucide's dedicated glyphs.
import {
  Archive as LucideArchive,
  Atom as LucideAtom,
  Binary as LucideBinary,
  Blocks as LucideBlocks,
  Bot as LucideBot,
  Box as LucideBox,
  Braces as LucideBraces,
  Brain as LucideBrain,
  Circle as LucideCircle,
  Coffee as LucideCoffee,
  Columns as LucideColumns,
  Cog as LucideCog,
  Cpu as LucideCpu,
  Database as LucideDatabase,
  File as LucideFile,
  FileCheck as LucideFileCheck,
  FileCode as LucideFileCode,
  FileCode2 as LucideFileCode2,
  FileSpreadsheet as LucideFileSpreadsheet,
  FileType as LucideFileType,
  Flame as LucideFlame,
  FlaskConical as LucideFlaskConical,
  Gem as LucideGem,
  GitBranch as LucideGitBranch,
  GitCommit as LucideGitCommit,
  Github as LucideGithub,
  GripVertical as LucideGripVertical,
  Hash as LucideHash,
  Hexagon as LucideHexagon,
  Image as LucideImage,
  Music2 as LucideMusic2,
  NotebookPen as LucideNotebookPen,
  Scroll as LucideScroll,
  SquareFunction as LucideSquareFunction,
  Target as LucideTarget,
  Video as LucideVideo,
  Workflow as LucideWorkflow,
} from 'lucide-react';

/**
 * Back-compat type alias for the old `LucideIcon` type. Every icon exported
 * by this module (Heroicons and Lucide-fallback alike) is a React component
 * that accepts `className` plus standard SVG props, so this shape is wide
 * enough to describe both.
 */
export type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

// ===== Heroicons aliased to the old Lucide names used throughout the app =====

// Arrows / nav
export const ArrowDown = ArrowDownIcon;
// ArrowDownIcon alias — some files imported it under the -Icon suffix already
export { ArrowDownIcon };
export const ArrowUp = ArrowUpIcon;
export const ArrowUpCircle = ArrowUpCircleIcon;
export const ArrowUpDown = ArrowsUpDownIcon;
export const ArrowLeft = ArrowLeftIcon;
export const ArrowRight = ArrowRightIcon;
export const ArrowDownToLine = ArrowDownTrayIcon;
export const ChevronDown = ChevronDownIcon;
export const ChevronUp = ChevronUpIcon;
export { ChevronDownIcon };
export const ChevronLeft = ChevronLeftIcon;
export const ChevronRight = ChevronRightIcon;
export const ChevronsUpDown = ChevronUpDownIcon;
export const ExternalLink = ArrowTopRightOnSquareIcon;
export const Download = ArrowDownTrayIcon;
export const Upload = ArrowUpTrayIcon;
export const LogIn = ArrowRightEndOnRectangleIcon;
export const PanelLeftClose = ChevronDoubleLeftIcon;
export const PanelLeftOpen = ChevronDoubleRightIcon;
export const RotateCcw = ArrowUturnLeftIcon;
export const RefreshCw = ArrowPathIcon;
export const Loader2 = ArrowPathIcon; // spinner — caller should add animate-spin
export const Maximize2 = ArrowsPointingOutIcon;
export const Minimize2 = ArrowsPointingInIcon;
export const SendHorizonalIcon = PaperAirplaneIcon;

// Alerts / status
export const AlertCircle = ExclamationCircleIcon;
export const AlertTriangle = ExclamationTriangleIcon;
export const Check = CheckIcon;
export const CheckCircle = CheckCircleIcon;
export const Info = InformationCircleIcon;
export const Shield = ShieldCheckIcon;
export const ShieldAlert = ShieldExclamationIcon;
export const ShieldAlertIcon = ShieldExclamationIcon;

// Content / files
export const BookOpen = BookOpenIcon;
export const Clipboard = ClipboardIcon;
export const ClipboardCheck = ClipboardDocumentCheckIcon;
export const Clock = ClockIcon;
export const Code2 = CodeBracketIcon;
export const Copy = DocumentDuplicateIcon;
export const FileText = DocumentTextIcon;
export const Folder = FolderIcon;
export const FolderOpen = FolderOpenIcon;
export const FolderPlus = FolderPlusIcon;
export const ImageIcon = PhotoIcon;
export const Inbox = InboxIcon;
export const List = ListBulletIcon;
export const ListChecks = QueueListIcon;
export const Rows3 = Bars3Icon;
export const Save = BookmarkSquareIcon;
export const TableProperties = TableCellsIcon;

// Actions
export const Edit = PencilIcon;
export const Edit2 = PencilIcon;
export const Edit3 = PencilSquareIcon;
export const Filter = FunnelIcon;
export const Flag = FlagIcon;
export const Grid = Squares2X2Icon;
export const HelpCircle = QuestionMarkCircleIcon;
export const Minus = MinusIcon;
export const Pause = PauseIcon;
export const Pencil = PencilIcon;
export const Play = PlayIcon;
export const Plus = PlusIcon;
export const Trash2 = TrashIcon;
export const MoreHorizontal = EllipsisHorizontalIcon;
export const Search = MagnifyingGlassIcon;
export const X = XMarkIcon;
export const XIcon = XMarkIcon;
export const SquareIcon = StopIcon;

// People / messaging
export const Bell = BellIcon;
export const BellOff = BellSlashIcon;
export const BellRing = BellAlertIcon;
export const Mail = EnvelopeIcon;
export const MessageSquare = ChatBubbleLeftRightIcon;
export const MessageSquareIcon = ChatBubbleLeftRightIcon;
export const User = UserIcon;
export const Users = UsersIcon;

// System / settings
export const BarChart3 = ChartBarIcon;
export const Bug = BugAntIcon;
export const Cloud = CloudIcon;
export const Eye = EyeIcon;
export const EyeOff = EyeSlashIcon;
export const Globe = GlobeAltIcon;
export const History = ClockIcon;
export const Key = KeyIcon;
export const KeyRound = KeyIcon;
export const Languages = LanguageIcon;
export const Lock = LockClosedIcon;
export const Moon = MoonIcon;
export const Palette = SwatchIcon;
export const Puzzle = PuzzlePieceIcon;
export const Server = ServerIcon;
export const ServerCrash = ServerStackIcon;
export const Settings = Cog6ToothIcon;
export const Settings2 = AdjustmentsHorizontalIcon;
export const Sparkles = SparklesIcon;
export const Star = StarIcon;
export const Sun = SunIcon;
export const Terminal = CommandLineIcon;
export const Zap = BoltIcon;

// ===== Lucide fallbacks (no Heroicons equivalent) =====
// AI / niche
export const Atom = LucideAtom;
export const Bot = LucideBot;
export const Brain = LucideBrain;
export const BrainIcon = LucideBrain;

// Git / brands
export const GitBranch = LucideGitBranch;
export const GitCommit = LucideGitCommit;
export const Github = LucideGithub;

// File-type specific glyphs (file tree / code editor)
export const Archive = LucideArchive;
export const Binary = LucideBinary;
export const Blocks = LucideBlocks;
export const Box = LucideBox;
export const Braces = LucideBraces;
export const Coffee = LucideCoffee;
export const Cog = LucideCog;
export const Cpu = LucideCpu;
export const Database = LucideDatabase;
export const File = LucideFile;
export const FileCheck = LucideFileCheck;
export const FileCode = LucideFileCode;
export const FileCode2 = LucideFileCode2;
export const FileSpreadsheet = LucideFileSpreadsheet;
export const FileType = LucideFileType;
export const Flame = LucideFlame;
export const FlaskConical = LucideFlaskConical;
export const Gem = LucideGem;
export const Hash = LucideHash;
export const Hexagon = LucideHexagon;
export const Image = LucideImage;
export const Music2 = LucideMusic2;
export const NotebookPen = LucideNotebookPen;
export const Scroll = LucideScroll;
export const SquareFunction = LucideSquareFunction;
export const Video = LucideVideo;
export const Workflow = LucideWorkflow;

// Geometric shapes and dev-UI primitives Heroicons doesn't supply cleanly
export const Circle = LucideCircle;
export const Columns = LucideColumns;
export const GripVertical = LucideGripVertical;
export const Target = LucideTarget;
