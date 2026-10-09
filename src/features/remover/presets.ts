import type { ExportFormat } from '@/lib/bg/compose';

export type ToolPresetId =
  | 'default'
  | 'white'
  | 'transparent'
  | 'logo'
  | 'passport'
  | 'heic';

export type ToolPreset = {
  id: ToolPresetId;
  backgroundId: 'transparent' | 'white';
  format: ExportFormat;
  square: boolean;
  filenameTag: string;
  dualPreview: boolean;
  jpgWarning: boolean;
};

export const TOOL_PRESETS: Record<ToolPresetId, ToolPreset> = {
  default: {
    id: 'default',
    backgroundId: 'transparent',
    format: 'image/png',
    square: false,
    filenameTag: 'no-bg',
    dualPreview: false,
    jpgWarning: false,
  },
  white: {
    id: 'white',
    backgroundId: 'white',
    format: 'image/jpeg',
    square: true,
    filenameTag: 'white',
    dualPreview: false,
    jpgWarning: false,
  },
  transparent: {
    id: 'transparent',
    backgroundId: 'transparent',
    format: 'image/png',
    square: false,
    filenameTag: 'transparent',
    dualPreview: true,
    jpgWarning: false,
  },
  logo: {
    id: 'logo',
    backgroundId: 'transparent',
    format: 'image/png',
    square: false,
    filenameTag: 'logo',
    dualPreview: true,
    jpgWarning: true,
  },
  passport: {
    id: 'passport',
    backgroundId: 'white',
    format: 'image/jpeg',
    square: true,
    filenameTag: 'passport',
    dualPreview: false,
    jpgWarning: false,
  },
  heic: {
    id: 'heic',
    backgroundId: 'transparent',
    format: 'image/png',
    square: false,
    filenameTag: 'no-bg',
    dualPreview: false,
    jpgWarning: false,
  },
};
