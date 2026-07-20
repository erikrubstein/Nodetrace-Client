import {
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  Contrast,
  Copy as CopyGlyph,
  CornerRightDown,
  Crop,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Folder,
  FolderPlus,
  Globe,
  Grid3X3,
  House,
  Image as ImageGlyph,
  Images,
  Import,
  ListChecks,
  LayoutTemplate,
  LoaderCircle,
  LocateFixed,
  Lock,
  LockOpen,
  Map as MapGlyph,
  MapPin,
  MapPinned,
  MapPinX,
  Maximize2,
  Minus,
  Minimize2,
  Moon,
  Network,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Route,
  Search,
  Settings,
  Smartphone,
  Square,
  Star,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react'

function renderIcon(Icon, props = {}) {
  const { size = 16, strokeWidth = 2.25, ...rest } = props
  return (
    <Icon
      {...rest}
      aria-hidden="true"
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
    />
  )
}

export function SunIcon(props) {
  return renderIcon(Sun, props)
}

export function MoonIcon(props) {
  return renderIcon(Moon, props)
}

export function WrenchIcon(props) {
  return renderIcon(Wrench, props)
}

export function FolderIcon(props) {
  return renderIcon(Folder, props)
}

export function GearIcon(props) {
  return renderIcon(Settings, props)
}

export function AddFolderIcon(props) {
  return renderIcon(FolderPlus, props)
}

export function PlusIcon(props) {
  return renderIcon(Plus, props)
}

export function AddPhotoIcon(props) {
  return renderIcon(ImageGlyph, props)
}

export function AddVariantIcon(props) {
  return renderIcon(Images, props)
}

export function FitViewIcon(props) {
  return renderIcon(Maximize2, props)
}

export function FocusNodeIcon(props) {
  return renderIcon(LocateFixed, props)
}

export function RootNodeIcon(props) {
  return renderIcon(House, props)
}

export function CameraIcon(props) {
  return renderIcon(Camera, props)
}

export function PreviewIcon(props) {
  return renderIcon(Eye, props)
}

export function PhoneIcon(props) {
  return renderIcon(Smartphone, props)
}

export function UserIcon(props) {
  return renderIcon(User, props)
}

export function UsersIcon(props) {
  return renderIcon(Users, props)
}

export function GlobeIcon(props) {
  return renderIcon(Globe, props)
}

export function WarningIcon(props) {
  return renderIcon(TriangleAlert, props)
}

export function TrashIcon(props) {
  return renderIcon(Trash2, props)
}

export function IdentificationIcon(props) {
  return renderIcon(ListChecks, props)
}

export function TemplatesIcon(props) {
  return renderIcon(LayoutTemplate, props)
}

export function GridIcon(props) {
  return renderIcon(Grid3X3, props)
}

export function SearchIcon(props) {
  return renderIcon(Search, props)
}

export function PencilIcon(props) {
  return renderIcon(Pencil, props)
}

export function EyeLowVisionIcon(props) {
  return renderIcon(EyeOff, props)
}

export function PathIcon(props) {
  return renderIcon(Route, props)
}

export function TreeViewIcon(props) {
  return renderIcon(Network, props)
}

export function FloorPlanIcon(props) {
  return renderIcon(MapGlyph, props)
}

export function LocationIcon(props) {
  return renderIcon(MapPin, props)
}

export function PaletteIcon(props) {
  return renderIcon(Palette, props)
}

export function ImportIcon(props) {
  return renderIcon(Import, props)
}

export function CloseIcon(props) {
  return renderIcon(X, props)
}

export function SpinnerIcon(props = {}) {
  const className = ['icon-spin', props.className].filter(Boolean).join(' ')
  return renderIcon(LoaderCircle, { ...props, className })
}

export function LockIcon(props) {
  return renderIcon(Lock, props)
}

export function UnlockIcon(props) {
  return renderIcon(LockOpen, props)
}

export function FilterIcon(props) {
  return renderIcon(Filter, props)
}

export function SelectAllIcon(props) {
  return renderIcon(CheckCheck, props)
}

export function CheckIcon(props) {
  return renderIcon(Check, props)
}

export function ContrastIcon(props) {
  return renderIcon(Contrast, props)
}

export function ResetIcon(props) {
  return renderIcon(RotateCcw, props)
}

export function DownloadIcon(props) {
  return renderIcon(Download, props)
}

export function CopyIcon(props) {
  return renderIcon(CopyGlyph, props)
}

export function RotateIcon(props) {
  return renderIcon(RotateCw, props)
}

export function CropIcon(props) {
  return renderIcon(Crop, props)
}

export function EraserIcon(props) {
  return renderIcon(Eraser, props)
}

export function StarIcon(props) {
  return renderIcon(Star, props)
}

export function ConvertToChildIcon(props) {
  return renderIcon(CornerRightDown, props)
}

export function UploadIcon(props) {
  return renderIcon(Upload, props)
}

export function DockIcon(props) {
  return renderIcon(Minimize2, props)
}

export function PopoutIcon(props) {
  return renderIcon(ExternalLink, props)
}

export function MinusIcon(props) {
  return renderIcon(Minus, props)
}

export function RestoreWindowIcon(props) {
  return renderIcon(CopyGlyph, props)
}

export function MaximizeWindowIcon(props) {
  return renderIcon(Square, props)
}

export function ChevronRightIcon(props) {
  return renderIcon(ChevronRight, props)
}

export function MapOverviewIcon(props) {
  return renderIcon(MapPinned, props)
}

export function RemoveLocationIcon(props) {
  return renderIcon(MapPinX, props)
}
