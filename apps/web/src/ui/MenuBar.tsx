import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { MenuSection, useUI } from './state';
import { windowMenuItems, getTileIconStyle } from './windowMenu';

const GridIcon = ({ rows, cols }: { rows: number; cols: number }) => {
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.25) 0, rgba(255,255,255,0.25) 1px, transparent 1px),
      linear-gradient(180deg, rgba(255,255,255,0.25) 0, rgba(255,255,255,0.25) 1px, transparent 1px)`,
    backgroundSize: `${100 / cols}% 100%, 100% ${100 / rows}%`,
    backgroundRepeat: 'repeat'
  };
  return <span className="menu-icon grid" style={style} />;
};

const buildMenus = (
  hasWindow: boolean,
  tile: (layout: any) => void,
  gridRows: number,
  setGrid: (rows: number, cols: number) => void,
  toggleMax: (id: string) => void,
  focusedId?: string | null
) => {
  // Map window menu items to menu format, with Fullscreen as maximize
  const windowItems = windowMenuItems.map((item) => ({
    label: item.label,
    action: () => {
      if (!hasWindow) return;
      if (item.label === 'Fullscreen' && focusedId) {
        toggleMax(focusedId);
      } else {
        tile(item.action);
      }
    },
    icon: <span className="menu-icon" style={getTileIconStyle(item.icon)} />,
    disabled: !hasWindow
  }));

  const gridOptions = [
    { label: '4-cell (2×2)', rows: 2, cols: 2 },
    { label: '6-cell (3×2)', rows: 3, cols: 2 },
    { label: '8-cell (4×2)', rows: 4, cols: 2 }
  ];

  return [
    {
      title: 'DevOS',
      items: [{ label: 'About DevOS' }]
    },
    {
      title: 'Window',
      items: windowItems
    },
    {
      title: 'Layout',
      items: gridOptions.map((opt) => ({
        label: `${opt.label}${gridRows === opt.rows ? ' ✓' : ''}`,
        action: () => setGrid(opt.rows, opt.cols),
        icon: <GridIcon rows={opt.rows} cols={opt.cols} />
      }))
    }
  ] satisfies MenuSection[];
};

export const MenuBar = () => {
  const { windows, focusedId, tile, gridRows, setGrid, toggleMax } = useUI();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menubarRef = useRef<HTMLDivElement | null>(null);
  const focused = windows.find((w) => w.id === focusedId);
  useEffect(() => {
    if (!openMenu) return;
    const handler = (ev: MouseEvent) => {
      if (!menubarRef.current) return;
      if (menubarRef.current.contains(ev.target as Node)) return;
      setOpenMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);
  const baseSections: MenuSection[] = useMemo(() => buildMenus(
    !!focused,
    (layout: string) => focused && tile(focused.id, layout as any),
    gridRows,
    setGrid,
    (id) => toggleMax(id),
    focused?.id
  ), [focused, gridRows, setGrid, tile, toggleMax]);
  const sections = focused?.menus?.length ? [...baseSections, ...focused.menus] : baseSections;

  const toggle = (title: string) => {
    setOpenMenu((prev) => (prev === title ? null : title));
  };

  return (
    <div className="menubar" ref={menubarRef}>
      {sections.map((section) => (
        <div key={section.title} className={`menu ${openMenu === section.title ? 'open' : ''}`}>
          <button onClick={() => toggle(section.title)}>{section.title}</button>
          {openMenu === section.title && (
            <div className="menu-dropdown">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  disabled={item.disabled}
                  onClick={() => {
                    item.action?.();
                    setOpenMenu(null);
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
