import { CSSProperties } from 'react';
import { TilePreset } from './state';

type IconStyle = CSSProperties & {
  ['--tile-left']?: string;
  ['--tile-top']?: string;
  ['--tile-width']?: string;
  ['--tile-height']?: string;
};

export const TileIcon = ({ left, top, width, height }: { left: number; top: number; width: number; height: number }) => ({
  type: 'tile' as const,
  left, top, width, height
});

export interface WindowMenuItem {
  label: string;
  action: TilePreset;
  icon: ReturnType<typeof TileIcon>;
}

export const windowMenuItems: WindowMenuItem[] = [
  //{ label: 'Center', action: 'center', icon: TileIcon({ left: 15, top: 15, width: 70, height: 70 }) },
  { label: 'Fullscreen', action: 'center', icon: TileIcon({ left: 0, top: 0, width: 100, height: 100 }) },
  { label: 'Half Left', action: 'left', icon: TileIcon({ left: 0, top: 0, width: 50, height: 100 }) },
  { label: 'Half Right', action: 'right', icon: TileIcon({ left: 50, top: 0, width: 50, height: 100 }) },
  { label: 'Half Top', action: 'top', icon: TileIcon({ left: 0, top: 0, width: 100, height: 50 }) },
  { label: 'Half Bottom', action: 'bottom', icon: TileIcon({ left: 0, top: 50, width: 100, height: 50 }) },
  { label: 'Upper Left', action: 'tl', icon: TileIcon({ left: 0, top: 0, width: 50, height: 50 }) },
  { label: 'Upper Right', action: 'tr', icon: TileIcon({ left: 50, top: 0, width: 50, height: 50 }) },
  { label: 'Lower Left', action: 'bl', icon: TileIcon({ left: 0, top: 50, width: 50, height: 50 }) },
  { label: 'Lower Right', action: 'br', icon: TileIcon({ left: 50, top: 50, width: 50, height: 50 }) }
];

// Render the tile icon as CSS styles
export const getTileIconStyle = (icon: ReturnType<typeof TileIcon>): IconStyle => ({
  '--tile-left': `${icon.left}%`,
  '--tile-top': `${icon.top}%`,
  '--tile-width': `${icon.width}%`,
  '--tile-height': `${icon.height}%`
} as IconStyle);
