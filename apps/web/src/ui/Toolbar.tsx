import { useState, ReactNode } from 'react';

// Icon components
const icons: Record<string, React.FC<{ size?: number }>> = {
  git: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.2 11.37.6.11.82-.26.82-.58v-2.03c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 016 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.82.58C20.56 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  ),
  pull: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3v12M6 15l-3-3m3 3l3-3M18 9V3m0 6l-3-3m3 3l3-3M12 21V9"/>
    </svg>
  ),
  push: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 21V9M6 9l-3 3m3-3l3 3M18 15V3m0 12l-3-3m3 3l3-3M12 3v12"/>
    </svg>
  ),
  branch: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <path d="M6 9v6M6 9a3 3 0 013-3h6a3 3 0 013 3v6"/>
    </svg>
  ),
  play: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  download: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
    </svg>
  ),
  clone: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      <path d="M12 15v6m-3-3l3 3 3-3"/>
    </svg>
  ),
  package: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
  wrench: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  chevronDown: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6"/>
    </svg>
  ),
  chevronRight: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  ),
  refresh: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
    </svg>
  ),
  up: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5M5 12l7-7 7 7"/>
    </svg>
  ),
  folder: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
};

interface ToolbarButtonProps {
  icon: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export const ToolbarButton = ({ icon, title, onClick, disabled }: ToolbarButtonProps) => {
  const Icon = icons[icon] || icons.wrench;
  return (
    <button 
      className="toolbar-btn" 
      onClick={onClick} 
      disabled={disabled}
      title={title}
    >
      <Icon size={14} />
      {title && <span className="toolbar-btn-text">{title}</span>}
    </button>
  );
};

interface ToolbarSectionProps {
  title: string;
  icon?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export const ToolbarSection = ({ 
  title, 
  icon, 
  children, 
  defaultExpanded = true 
}: ToolbarSectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Icon = icon ? icons[icon] : null;
  const Chevron = expanded ? icons.chevronDown : icons.chevronRight;

  return (
    <div className={`toolbar-section ${expanded ? 'expanded' : 'collapsed'}`}>
      <button 
        className="toolbar-section-header" 
        onClick={() => setExpanded(!expanded)}
      >
        <Chevron size={10} />
        {Icon && <Icon size={14} />}
        <span className="toolbar-section-title">{title}</span>
      </button>
      {expanded && (
        <div className="toolbar-section-content">
          {children}
        </div>
      )}
    </div>
  );
};

interface ToolbarProps {
  children: ReactNode;
  path?: string;
}

export const Toolbar = ({ children, path }: ToolbarProps) => {
  return (
    <div className="toolbar-container">
      {path && <div className="toolbar-path">{path}</div>}
      <div className="toolbar-row">
        {children}
      </div>
    </div>
  );
};
